import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { isAllowedOrigin } from "../../config/cors";
import { AppError } from "../../utils/app-error";
import { clearSessionCookie, readCookie, SESSION_COOKIE } from "./auth.cookies";
import { authRepository, type AuthUserRecord } from "./auth.repository";
import { isTokenRevoked } from "./auth.token-blacklist";
import type { AuthContext } from "./auth.types";

// ---------- Validación de entradas ----------

export const emailSchema = z
  .string({ error: "El email es obligatorio" })
  .trim()
  .toLowerCase()
  .max(255, "El email no puede superar 255 caracteres")
  .pipe(z.email({ error: "El email no es válido" }));

export const fullNameSchema = z
  .string({ error: "El nombre completo es obligatorio" })
  .trim()
  .min(2, "El nombre completo debe tener al menos 2 caracteres")
  .max(120, "El nombre completo es demasiado largo");

/** Reglas de una contraseña nueva (registro y cambio de contraseña). */
export const newPasswordSchema = z
  .string({ error: "La contraseña es obligatoria" })
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  // bcrypt solo usa los primeros 72 bytes; más allá se ignorarían en silencio.
  .max(72, "La contraseña no puede superar 72 caracteres")
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "La contraseña debe contener al menos una letra y un número");

const registerSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});

/** Valida el body con zod. Si falla, responde 400 con el mismo formato que el resto de módulos. */
export function validateBody(schema: z.ZodType, errorCode: string, message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: errorCode,
        message,
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

const emailQuerySchema = z.object({ email: emailSchema });

/** Valida `?email=` de GET /api/auth/email-available (Express 5: req.query es de solo lectura). */
export function parseEmailQuery(query: unknown): string {
  const result = emailQuerySchema.safeParse(query);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_EMAIL_QUERY",
      "Email inválido",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data.email;
}

export const validateRegister = validateBody(registerSchema, "INVALID_REGISTER_PAYLOAD", "Datos de registro inválidos");
export const validateLogin = validateBody(loginSchema, "INVALID_LOGIN_PAYLOAD", "Datos de inicio de sesión inválidos");

// ---------- Protección de rutas ----------

function unauthorized(message: string): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * De dónde sale el token: la cookie de sesión (navegador, HttpOnly) o la cabecera
 * `Authorization: Bearer` (Swagger, Postman, pruebas). La cabecera tiene prioridad.
 */
function readToken(req: Request): { token: string; fromCookie: boolean } | null {
  const [scheme, bearer] = (req.headers.authorization ?? "").split(" ");
  if (scheme === "Bearer" && bearer) return { token: bearer, fromCookie: false };
  const cookie = readCookie(req, SESSION_COOKIE);
  return cookie ? { token: cookie, fromCookie: true } : null;
}

/** Verifica firma, vencimiento, que no esté revocado y que el usuario siga activo. Si no, 401. */
export async function authenticate(token: string): Promise<{ auth: AuthContext; user: AuthUserRecord }> {
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") throw new Error("Payload inesperado");
    payload = decoded;
  } catch (err) {
    throw unauthorized(err instanceof jwt.TokenExpiredError ? "La sesión expiró" : "Sesión inválida");
  }

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw unauthorized("Sesión inválida");
  if (isTokenRevoked(jti)) throw unauthorized("La sesión fue cerrada");

  const user = await authRepository.findActiveById(sub);
  if (!user || user.status !== "active") throw unauthorized("El usuario no existe o no está activo");

  return { auth: { userId: sub, jti, exp }, user };
}

/**
 * Defensa extra contra CSRF (además de SameSite=Lax): si la sesión viene en la cookie y la petición
 * modifica datos, tiene que venir del front (Origin permitido) o de este mismo servidor (Swagger en /docs).
 */
function assertTrustedOrigin(req: Request): void {
  const origin = req.headers.origin;
  if (!origin || isAllowedOrigin(origin)) return;
  try {
    if (new URL(origin).host === req.headers.host) return;
  } catch {
    // Origin mal formado: se rechaza abajo.
  }
  throw new AppError(403, "FORBIDDEN_ORIGIN", "Origen no permitido para esta operación");
}

/**
 * Protege una ruta: exige una sesión válida (cookie o Bearer), no revocada y de un usuario activo.
 * Deja los datos del token en `req.auth`.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const found = readToken(req);
  if (!found) throw unauthorized("No hay una sesión iniciada");
  if (found.fromCookie && !SAFE_METHODS.has(req.method)) assertTrustedOrigin(req);

  req.auth = (await authenticate(found.token)).auth;
  next();
}

/**
 * Para rutas que responden con o sin sesión (GET /session, POST /logout): deja `req.auth` si hay
 * una sesión válida y nunca responde 401. Si la cookie ya no sirve, la borra.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const found = readToken(req);
  if (found) {
    try {
      req.auth = (await authenticate(found.token)).auth;
    } catch (err) {
      if (!(err instanceof AppError) || err.statusCode !== 401) throw err;
      if (found.fromCookie) clearSessionCookie(res);
    }
  }
  next();
}

/**
 * Solo administradores (email en ADMIN_EMAILS). Va después de `requireAuth`.
 * Protege el CRUD que ve o modifica datos de TODOS los usuarios: un usuario común solo usa las rutas /me.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const user = await authRepository.findActiveById(auth.userId);
  if (!user || !env.adminEmails.has(user.email.toLowerCase())) {
    throw new AppError(403, "FORBIDDEN", "Esta operación es solo para administradores");
  }
  next();
}

/** Para controladores detrás de `requireAuth`, que garantiza que `req.auth` existe. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized("No autenticado");
  return req.auth;
}
