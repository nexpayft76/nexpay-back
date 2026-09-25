import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const userStatusSchema = z.enum(["active", "inactive", "closed"]);

const createUserSchema = z.object({
  full_name: z.string().trim().min(2, "El nombre completo es obligatorio").max(120, "El nombre completo es demasiado largo"),
  email: z.string().trim().email("El email no es válido"),
  password_hash: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  status: userStatusSchema.optional(),
});

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2, "El nombre completo es obligatorio").max(120, "El nombre completo es demasiado largo").optional(),
  email: z.string().trim().email("El email no es válido").optional(),
  password_hash: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
  status: userStatusSchema.optional(),
});

export function validateCreateUser(req: Request, res: Response, next: NextFunction): void {
  const result = createUserSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_USER_PAYLOAD",
      message: "Datos del usuario inválidos",
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  req.body = result.data;
  next();
}

export function validateUpdateUser(req: Request, res: Response, next: NextFunction): void {
  const result = updateUserSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_USER_PAYLOAD",
      message: "Datos del usuario inválidos",
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  req.body = result.data;
  next();
}

export function validateUserId(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id ?? "");

  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
    res.status(400).json({
      error: "INVALID_USER_ID",
      message: "El id del usuario no es válido",
    });
    return;
  }

  next();
}
