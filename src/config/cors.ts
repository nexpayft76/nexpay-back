import type { CorsOptions } from "cors";
import { env } from "./env";

/**
 * Convierte cada entrada de FRONTEND_URL en una regla:
 * - "https://nexpay-front.vercel.app"   → coincidencia exacta.
 * - "https://nexpay-front-*.vercel.app" → el "*" acepta letras, números y guiones (sin puntos),
 *   así cubre los previews de Vercel (una URL por PR) sin aceptar otros dominios.
 */
function toMatcher(entry: string): (origin: string) => boolean {
  if (!entry.includes("*")) return (origin) => origin === entry;

  const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+");
  const pattern = new RegExp(`^${escaped}$`, "i");
  return (origin) => pattern.test(origin);
}

const matchers = env.corsOrigins.map(toMatcher);

export function isAllowedOrigin(origin: string): boolean {
  return matchers.some((matches) => matches(origin));
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Sin cabecera Origin (curl, Postman, servidor a servidor): no es un navegador, CORS no aplica.
    // Origen no permitido: se responde sin cabeceras CORS y el navegador bloquea la respuesta.
    callback(null, origin === undefined || isAllowedOrigin(origin));
  },
  credentials: true,
};
