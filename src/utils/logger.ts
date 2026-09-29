import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";
type Meta = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// En producción no se registran los "debug"; en desarrollo, todo.
const MIN_LEVEL: Level = env.isProduction ? "info" : "debug";

function serializeError(err: unknown): unknown {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

/**
 * Logger del back, sin librerías. En producción escribe una línea JSON por evento (Railway la muestra
 * y permite filtrar por `level` o `request_id`); en desarrollo, una línea legible.
 */
function write(level: Level, message: string, meta: Meta = {}): void {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;
  const data: Meta = { ...meta };
  if ("error" in data) data.error = serializeError(data.error);

  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (env.isProduction) {
    out(JSON.stringify({ time: new Date().toISOString(), level, message, ...data }));
  } else {
    const extra = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
    out(`[${level}] ${message}${extra}`);
  }
}

export const logger = {
  debug: (message: string, meta?: Meta) => write("debug", message, meta),
  info: (message: string, meta?: Meta) => write("info", message, meta),
  warn: (message: string, meta?: Meta) => write("warn", message, meta),
  error: (message: string, meta?: Meta) => write("error", message, meta),
};
