import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";
import { authRepository } from "./auth.repository";
import { isTokenRevoked } from "./auth.token-blacklist";
import type { AuthContext } from "./auth.types";

// ---------- Validación de entradas ----------

const emailSchema = z
  .string({ error: "El email es obligatorio" })
  .trim()
  .toLowerCase()
  .max(255, "El email no puede superar 255 caracteres")
  .pipe(z.email({ error: "El email no es válido" }));

const registerSchema = z.object({
  full_name: z
    .string({ error: "El nombre completo es obligatorio" })
    .trim()
    .min(2, "El nombre completo debe tener al menos 2 caracteres")
    .max(120, "El nombre completo es demasiado largo"),
  email: emailSchema,
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    // bcrypt solo usa los primeros 72 bytes; más allá se ignorarían en silencio.
    .max(72, "La contraseña no puede superar 72 caracteres")
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "La contraseña debe contener al menos una letra y un número"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});

/** Valida el body con zod. Si falla, responde 400 con el mismo formato que el resto de módulos. */
function validateBody(schema: z.ZodType, errorCode: string, message: string) {
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

export const validateRegister = validateBody(registerSchema, "INVALID_REGISTER_PAYLOAD", "Datos de registro inválidos");
export const validateLogin = validateBody(loginSchema, "INVALID_LOGIN_PAYLOAD", "Datos de inicio de sesión inválidos");

// ---------- Protección de rutas ----------

function unauthorized(message: string): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

/**
 * Protege una ruta: exige `Authorization: Bearer <token>` válido, no revocado
 * y de un usuario activo. Deja los datos del token en `req.auth`.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw unauthorized("Falta el token de autenticación (Authorization: Bearer <token>)");
  }

  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") throw new Error("Payload inesperado");
    payload = decoded;
  } catch (err) {
    throw unauthorized(err instanceof jwt.TokenExpiredError ? "El token expiró" : "Token inválido");
  }

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw unauthorized("Token inválido");
  if (isTokenRevoked(jti)) throw unauthorized("La sesión fue cerrada");

  const user = await authRepository.findActiveById(sub);
  if (!user || user.status !== "active") throw unauthorized("El usuario no existe o no está activo");

  req.auth = { userId: sub, jti, exp };
  next();
}

/** Para controladores detrás de `requireAuth`, que garantiza que `req.auth` existe. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized("No autenticado");
  return req.auth;
}
