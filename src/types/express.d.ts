import type { AuthContext } from "./auth";

declare global {
  namespace Express {
    interface Request {
      /** Presente solo en rutas protegidas por `requireAuth`. */
      auth?: AuthContext;
    }
  }
}

export {};
