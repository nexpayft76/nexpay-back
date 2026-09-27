import type { AuthContext } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      /** Presente solo en rutas protegidas por `requireAuth`. */
      auth?: AuthContext;
    }
  }
}

export {};
