import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { emailSchema, fullNameSchema, validateBody } from "../auth/auth.middlewares";

const userStatusSchema = z.enum(["active", "suspended", "closed"]);
const themeSchema = z.object({ theme: z.enum(["light", "dark"]) }).strict();
const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark"]).optional(),
    in_app_notifications: z.boolean().optional(),
    email_notifications: z.boolean().optional(),
  })
  .strict();

export function validateTheme(req: Request, res: Response, next: NextFunction): void {
  const result = themeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "INVALID_THEME",
      message: "El tema debe ser light o dark",
    });
    return;
  }
  req.body = result.data;
  next();
}

export function validatePreferences(req: Request, res: Response, next: NextFunction): void {
  const result = preferencesSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "INVALID_PREFERENCES",
      message: "Las preferencias del usuario son inválidas",
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

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2, "El nombre completo es obligatorio").max(120, "El nombre completo es demasiado largo").optional(),
  email: z.string().trim().email("El email no es válido").optional(),
  status: userStatusSchema.optional(),
}).strict();

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

/**
 * PATCH /api/users/me: el usuario solo puede cambiar su nombre y su email.
 * `.strict()` rechaza cualquier otro campo (en especial `status`, que solo toca un administrador).
 */
export const updateMeSchema = z
  .object({ full_name: fullNameSchema.optional(), email: emailSchema.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Debe enviar al menos un campo");

/** DELETE /api/users/me: la contraseña confirma que quien pide cerrar la cuenta es su dueño. */
export const closeAccountSchema = z
  .object({ password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria") })
  .strict();

export const validateUpdateMe = validateBody(updateMeSchema, "INVALID_PROFILE_PAYLOAD", "Datos del perfil inválidos");
export const validateCloseAccount = validateBody(
  closeAccountSchema,
  "INVALID_CLOSE_ACCOUNT_PAYLOAD",
  "Para cerrar la cuenta hay que enviar la contraseña",
);
