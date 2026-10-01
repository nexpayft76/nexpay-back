import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

/** Las peticiones más lentas que esto se registran como aviso. */
const SLOW_MS = 1500;

/**
 * Registra cada petición al terminar: método, ruta, estado y cuánto tardó.
 * Le pone un id (cabecera `X-Request-Id`) que el front puede mostrar o registrar,
 * así un error visto en el navegador se encuentra rápido en los logs de Railway.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    // Sin query string: puede traer emails u otros datos del usuario.
    const path = req.originalUrl.split("?")[0];
    const meta = { request_id: requestId, method: req.method, path, status: res.statusCode, ms };
    if (res.statusCode >= 500) logger.error("request", meta);
    else if (ms > SLOW_MS) logger.warn("request lenta", meta);
    else if (path === "/health") logger.debug("request", meta); // Railway lo consulta seguido: no ensucia los logs.
    else logger.info("request", meta);
  });
  next();
}
