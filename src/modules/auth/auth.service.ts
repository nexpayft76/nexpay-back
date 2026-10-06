import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseError } from "pg";
import { withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";
import { notificationsService } from "../notifications";
import { authRepository, type AuthUserRecord } from "./auth.repository";
import { passwordResetRepository } from "./password-reset.repository";
import { revokeToken } from "./auth.token-blacklist";
import type { AuthContext, AuthResult, PublicUser } from "./auth.types";

export const BCRYPT_ROUNDS = 10;
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
    role: user.role,
    is_owner: user.is_owner,
    created_at: user.created_at.toISOString(),
  };
}

function issueToken(user: AuthUserRecord): AuthResult {
  const token = jwt.sign({ sv: user.session_version }, env.JWT_SECRET, {
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

      // Envío de email de bienvenida y agradecimiento por registrarse (asíncrono)
      void notificationsService.sendWelcomeEmail({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
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

  /** true si nadie se registró con ese email (el registro igual lo vuelve a verificar con UNIQUE). */
  async isEmailAvailable(email: string): Promise<boolean> {
    return (await authRepository.findByEmail(email)) === null;
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

  async requestPasswordReset(email: string): Promise<void> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const user = await authRepository.findByEmail(email);
    if (!user || user.deleted_at !== null || user.status !== "active" || !user.password_hash) return;

    const created = await passwordResetRepository.create(user.id, tokenHash, new Date(Date.now() + 60 * 60 * 1000));
    if (!created) return;
    const resetUrl = new URL("/reset-password", env.frontendAppUrl);
    resetUrl.hash = new URLSearchParams({ token }).toString();
    void notificationsService.sendPasswordResetEmail({
      user: { id: user.id, email: user.email, full_name: user.full_name },
      resetUrl: resetUrl.toString(),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    if (!(await passwordResetRepository.isValid(tokenHash))) {
      throw new AppError(400, "INVALID_OR_EXPIRED_RESET_TOKEN", "El enlace no es válido o ya venció");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await passwordResetRepository.consumeAndUpdatePassword(tokenHash, passwordHash);
    if (!user) {
      throw new AppError(400, "INVALID_OR_EXPIRED_RESET_TOKEN", "El enlace no es válido o ya venció");
    }
    void notificationsService.sendPasswordChangedEmail(user);
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
