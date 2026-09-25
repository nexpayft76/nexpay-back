import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import { findUserById } from "../repositories/user.repository";
import type { GoogleLoginInput, LoginInput, RegisterInput } from "../schemas/auth.schema";
import * as authService from "../services/auth.service";
import { AppError } from "../utils/app-error";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json(result);
}

export async function loginWithGoogle(req: Request, res: Response): Promise<void> {
  const { idToken } = req.body as GoogleLoginInput;
  const result = await authService.loginWithGoogle(idToken);
  res.status(result.isNewUser ? 201 : 200).json(result);
}

export function logout(req: Request, res: Response): void {
  authService.logout(getAuth(req));
  res.status(200).json({ message: "Sesión cerrada correctamente" });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await findUserById(getAuth(req).userId);
  if (!user) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
  res.status(200).json({ user: authService.toPublicUser(user) });
}
