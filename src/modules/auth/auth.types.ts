export type UserStatus = "active" | "suspended" | "closed";

/** Solo dos roles: el usuario común (todo el que se registra) y el superusuario. */
export type UserRole = "user" | "superuser";

/** Datos del token que `requireAuth` deja en `req.auth`. */
export interface AuthContext {
  userId: string;
  /** Identificador único del token, usado para invalidarlo en el logout. */
  jti: string;
  /** Expiración del token en segundos (epoch). */
  exp: number;
}

/** Usuario tal como lo devuelve la API: nunca incluye la contraseña. */
export interface PublicUser {
  id: string;
  full_name: string;
  email: string;
  status: UserStatus;
  role: UserRole;
  /** true solo en la cuenta propietaria de NexPay (recibe las comisiones). */
  is_owner: boolean;
  created_at: string;
}

export interface AuthResult {
  token: string;
  token_type: "Bearer";
  expires_in: number;
  user: PublicUser;
}
