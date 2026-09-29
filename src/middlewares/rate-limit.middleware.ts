import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

interface RateLimitOptions {
  /** Ventana de tiempo en milisegundos. */
  windowMs: number;
  /** Máximo de peticiones por IP dentro de la ventana. */
  max: number;
}

/**
 * Limita cuántas veces una misma IP puede llamar a una ruta (ventana fija, en memoria).
 * Sirve para rutas públicas sensibles, como consultar si un email está registrado:
 * permite validar un formulario en tiempo real, pero no probar miles de emails en automático.
 * Con varias instancias del servidor, cada una cuenta por separado (suficiente para NexPay hoy).
 */
export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? "desconocida";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    // Limpieza ocasional para que el mapa no crezca sin límite.
    if (hits.size > 10_000) {
      for (const [ip, value] of hits) if (value.resetAt <= now) hits.delete(ip);
    }

    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, "TOO_MANY_REQUESTS", "Demasiadas consultas. Probá de nuevo en un minuto.");
    }
    next();
  };
}
