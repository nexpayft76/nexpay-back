import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env";

/**
 * La sesión viaja en una cookie HttpOnly: el JavaScript de la página no puede leerla,
 * así que un script inyectado (XSS) no puede robar el token como pasaba con localStorage.
 *
 * El front llama a /api desde su propio dominio (Vercel reenvía /api al back, y en local lo hace Vite),
 * por eso la cookie es "propia" y alcanza con SameSite=Lax: el navegador no la manda en peticiones
 * que vienen de otros sitios, lo que además protege contra CSRF.
 */
export const SESSION_COOKIE = "nexpay_session";

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction, // En producción solo por HTTPS; en local (http://localhost) no se exige.
    sameSite: "lax",
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(), maxAge: env.jwtExpiresInSeconds * 1000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseOptions());
}

/** Lee una cookie de la cabecera `Cookie` (sin librerías: el formato es "a=1; b=2"). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
