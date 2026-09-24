export interface AuthContext {
  userId: string;
  /** Identificador único del token, usado para invalidarlo en el logout. */
  jti: string;
  /** Expiración del token en segundos (epoch). */
  exp: number;
}

export type UserStatus = "active" | "suspended" | "closed";

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  status: UserStatus;
  createdAt: string;
}
