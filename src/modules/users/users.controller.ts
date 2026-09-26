import type { Request, Response } from "express";

import { usersService } from "./users.service";

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
  const user = await usersService.updateUser(id, req.body);

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
