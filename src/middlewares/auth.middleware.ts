import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { findUserById } from "../repositories/user.repository";
import { isTokenRevoked } from "../services/token-blacklist.service";
import type { AuthContext } from "../types/auth";
import { AppError } from "../utils/app-error";

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
    const message = err instanceof jwt.TokenExpiredError ? "El token expiró" : "Token inválido";
    throw unauthorized(message);
  }

  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw unauthorized("Token inválido");
  if (isTokenRevoked(jti)) throw unauthorized("La sesión fue cerrada");

  const user = await findUserById(sub);
  if (!user || user.status !== "active") throw unauthorized("El usuario no existe o no está activo");

  req.auth = { userId: sub, jti, exp };
  next();
}

/** Para controladores detrás de `requireAuth`, que garantiza que `req.auth` existe. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized("No autenticado");
  return req.auth;
}
