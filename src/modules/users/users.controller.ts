import type { Request, Response } from "express";
import { DatabaseError } from "pg";

import { AppError } from "../../utils/app-error";
import type { UserRecord } from "./users.repository";
import { usersService } from "./users.service";
import { getAuth } from "../auth/auth.middlewares";

export async function getMyTheme(req: Request, res: Response): Promise<void> {
  const theme = await usersService.getThemeById(getAuth(req).userId);
  if (!theme) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }
  res.status(200).json({ data: { theme } });
}

export async function getMyPreferences(req: Request, res: Response): Promise<void> {
  const preferences = await usersService.getPreferencesById(getAuth(req).userId);
  if (!preferences) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }
  res.status(200).json({
    data: {
      theme: preferences.theme,
      in_app_notifications: preferences.in_app_notifications,
      email_notifications: preferences.email_notifications,
    },
  });
}

export async function updateMyTheme(req: Request, res: Response): Promise<void> {
  const theme = await usersService.updateTheme(getAuth(req).userId, req.body.theme);
  if (!theme) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }
  res.status(200).json({ data: { theme } });
}

export async function updateMyPreferences(req: Request, res: Response): Promise<void> {
  const preferences = await usersService.updatePreferences(getAuth(req).userId, req.body);
  if (!preferences) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }
  res.status(200).json({
    data: {
      theme: preferences.theme,
      in_app_notifications: preferences.in_app_notifications,
      email_notifications: preferences.email_notifications,
    },
  });
}

const PG_UNIQUE_VIOLATION = "23505";

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await usersService.listUsers();
  res.status(200).json({ data: users });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const user = await usersService.getUserById(id);

  if (!user) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }

  res.status(200).json({ data: user });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  let user: UserRecord | null;
  try {
    user = await usersService.updateUser(id, req.body);
  } catch (err) {
    // UNIQUE(email) en la BD: el email ya lo usa otra cuenta.
    if (err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ya existe una cuenta con ese email");
    }
    throw err;
  }

  if (!user) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }

  res.status(200).json({ data: user });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const deleted = await usersService.deleteUser(id);

  if (!deleted) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "Usuario no encontrado" });
    return;
  }

  res.status(204).send();
}
