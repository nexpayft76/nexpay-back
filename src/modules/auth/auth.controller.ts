import type { Request, Response } from "express";
import { getAuth, parseEmailQuery } from "./auth.middlewares";
import { authService, type LoginInput, type RegisterInput } from "./auth.service";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json({ data: result });
}

/** Para validar el registro en tiempo real: ¿el email ya tiene cuenta? */
export async function emailAvailable(req: Request, res: Response): Promise<void> {
  const email = parseEmailQuery(req.query);
  const available = await authService.isEmailAvailable(email);
  res.status(200).json({ data: { email, available } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json({ data: result });
}

export function logout(req: Request, res: Response): void {
  authService.logout(getAuth(req));
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.me(getAuth(req));
  res.status(200).json({ data: user });
}
