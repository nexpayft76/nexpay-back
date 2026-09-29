import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/**
 * Cabeceras de seguridad (lo que revisan herramientas como Mozilla Observatory o securityheaders.com),
 * sin librerías extra. La API solo devuelve JSON: su CSP no permite cargar nada ni ser incrustada.
 * /docs (Swagger) necesita sus propios scripts y estilos, por eso no lleva esa CSP.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (env.isProduction) {
    // Solo por HTTPS durante 2 años (en local se usa http://localhost).
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  if (!req.path.startsWith("/docs")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  }
  next();
}
