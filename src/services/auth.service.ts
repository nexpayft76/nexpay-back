import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseError } from "pg";
import { withTransaction } from "../config/db";
import { env } from "../config/env";
import { findUserByEmail, insertUser, type UserRow } from "../repositories/user.repository";
import { insertInitialBalances, insertWallet } from "../repositories/wallet.repository";
import type { LoginInput, RegisterInput } from "../schemas/auth.schema";
import type { AuthContext, PublicUser } from "../types/auth";
import { AppError } from "../utils/app-error";
import { revokeToken } from "./token-blacklist.service";

const BCRYPT_ROUNDS = 10;
// Hash de referencia para comparar cuando el email no existe: así login tarda lo mismo
// exista o no el usuario, y no se puede adivinar qué emails están registrados.
const DUMMY_HASH = bcrypt.hashSync("nexpay-dummy-password", BCRYPT_ROUNDS);
const PG_UNIQUE_VIOLATION = "23505";

export interface AuthResult {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function issueToken(user: UserRow): AuthResult {
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: user.id,
    jwtid: randomUUID(),
    expiresIn: env.jwtExpiresInSeconds,
    algorithm: "HS256",
  });
  return { token, tokenType: "Bearer", expiresIn: env.jwtExpiresInSeconds, user: toPublicUser(user) };
}

/**
 * Registra un usuario y crea su wallet con balances en 0 para cada moneda activa.
 * Todo ocurre en una sola transacción SQL: si algo falla, no queda un usuario sin wallet.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const user = await withTransaction(async (client) => {
      const created = await insertUser(client, {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
      });
      const walletId = await insertWallet(client, created.id);
      await insertInitialBalances(client, walletId);
      return created;
    });
    return issueToken(user);
  } catch (err) {
    // La restricción UNIQUE(email) de la base de datos es la fuente de verdad (evita carreras).
    if (err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ya existe una cuenta con ese email");
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  const passwordOk = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);

  if (!user || user.deleted_at !== null || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
  }
  if (user.status !== "active") {
    throw new AppError(403, "ACCOUNT_DISABLED", "La cuenta está suspendida o cerrada");
  }
  return issueToken(user);
}

export function logout(auth: AuthContext): void {
  revokeToken(auth.jti, auth.exp);
}
