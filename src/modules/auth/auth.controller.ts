import type { Request, Response } from "express";
import { clearSessionCookie, setSessionCookie } from "./auth.cookies";
import { getAuth, parseEmailQuery } from "./auth.middlewares";
import { authService, type LoginInput, type RegisterInput } from "./auth.service";

/** Crea la cuenta y deja la sesión iniciada en la cookie HttpOnly. */
export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);
  setSessionCookie(res, result.token);
  res.status(201).json({ data: result });
}

/** Para validar el registro en tiempo real: ¿el email ya tiene cuenta? */
export async function emailAvailable(req: Request, res: Response): Promise<void> {
  const email = parseEmailQuery(req.query);
  const available = await authService.isEmailAvailable(email);
  res.status(200).json({ data: { email, available } });
}

/** Inicia sesión y deja el token en la cookie HttpOnly (también lo devuelve para Swagger/Postman). */
export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  setSessionCookie(res, result.token);
  res.status(200).json({ data: result });
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  await authService.requestPasswordReset(req.body.email);
  res.status(200).json({
    data: { message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." },
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  await authService.resetPassword(req.body.token, req.body.new_password);
  res.status(200).json({ data: { message: "La contraseña se actualizó correctamente." } });
}

/** Cierra la sesión: invalida el token si todavía servía y borra la cookie. Nunca responde 401. */
export function logout(req: Request, res: Response): void {
  if (req.auth) authService.logout(req.auth);
  clearSessionCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.me(getAuth(req));
  res.status(200).json({ data: user });
}

/**
 * ¿Hay una sesión iniciada? Responde 200 siempre: `{ user, expires_at }` o `null`.
 * El front lo llama al cargar la página, así no aparece un 401 en la consola si no hay sesión.
 */
export async function session(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    res.status(200).json({ data: null });
    return;
  }
  const user = await authService.me(req.auth);
  res.status(200).json({ data: { user, expires_at: new Date(req.auth.exp * 1000).toISOString() } });
}
