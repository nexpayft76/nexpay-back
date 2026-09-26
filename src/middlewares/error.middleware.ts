import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "NOT_FOUND", message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Errores de negocio lanzados con AppError (400, 401, 409...)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // JSON mal formado en el body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "INVALID_JSON", message: "El cuerpo de la petición no es un JSON válido" });
    return;
  }

  console.error("Error no controlado:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Error interno del servidor" });
}
