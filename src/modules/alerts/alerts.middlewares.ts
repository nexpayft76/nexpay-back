import type { NextFunction, Request, Response } from "express";
import { createAlertSchema, updateAlertSchema } from "./alerts.schemas";

function validateBody(schema: typeof createAlertSchema | typeof updateAlertSchema, error: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error,
        message: "Datos de alerta inválidos",
        details: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export const validateCreateAlert = validateBody(createAlertSchema, "INVALID_ALERT_PAYLOAD");
export const validateUpdateAlert = validateBody(updateAlertSchema, "INVALID_ALERT_PAYLOAD");

export function validateAlertId(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id ?? "");
  if (id.startsWith("local-")) {
    res.status(404).json({ error: "ALERT_NOT_FOUND", message: "La alerta local no está almacenada en el servidor" });
    return;
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    res.status(400).json({ error: "INVALID_ALERT_ID", message: "El id de la alerta no es válido" });
    return;
  }
  next();
}