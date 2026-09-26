import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseError } from "pg";
import { withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";
import { authRepository, type AuthUserRecord } from "./auth.repository";
import { revokeToken } from "./auth.token-blacklist";
import type { AuthContext, AuthResult, PublicUser } from "./auth.types";

const BCRYPT_ROUNDS = 10;
// Hash de referencia para comparar cuando el email no existe (o la cuenta no tiene contraseña):
// así el login tarda lo mismo en todos los casos y no se puede adivinar qué emails están registrados.
const DUMMY_HASH = bcrypt.hashSync("nexpay-dummy-password", BCRYPT_ROUNDS);
const PG_UNIQUE_VIOLATION = "23505";

export interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export function toPublicUser(user: AuthUserRecord): PublicUser {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    status: user.status,
    created_at: user.created_at.toISOString(),
  };
}

function issueToken(user: AuthUserRecord): AuthResult {
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: user.id,
    jwtid: randomUUID(),
    expiresIn: env.jwtExpiresInSeconds,
    algorithm: "HS256",
  });
  return { token, token_type: "Bearer", expires_in: env.jwtExpiresInSeconds, user: toPublicUser(user) };
}

export const authService = {
  /**
   * Crea usuario (contraseña con bcrypt), su wallet y un balance en 0 por moneda activa,
   * todo en una sola transacción SQL: si algo falla, no queda un usuario sin wallet.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      const user = await withTransaction(async (client) => {
        const created = await authRepository.createUser(client, {
          full_name: input.full_name,
          email: input.email,
          password_hash,
        });
        const walletId = await authRepository.createWallet(client, created.id);
        await authRepository.createInitialBalances(client, walletId);
        return created;
      });
      return issueToken(user);
    } catch (err) {
      // La restricción UNIQUE(email) de la BD es la fuente de verdad (evita carreras entre peticiones).
      if (err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION) {
        throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ya existe una cuenta con ese email");
      }
      throw err;
    }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await authRepository.findByEmail(input.email);
    const passwordOk = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !user.password_hash || user.deleted_at !== null || !passwordOk) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
    }
    if (user.status !== "active") {
      throw new AppError(403, "ACCOUNT_DISABLED", "La cuenta está suspendida o cerrada");
    }
    return issueToken(user);
  },

  logout(auth: AuthContext): void {
    revokeToken(auth.jti, auth.exp);
  },

  async me(auth: AuthContext): Promise<PublicUser> {
    const user = await authRepository.findActiveById(auth.userId);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    return toPublicUser(user);
  },
};
