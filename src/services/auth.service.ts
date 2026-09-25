import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseError } from "pg";
import { withTransaction } from "../config/db";
import { env } from "../config/env";
import { verifyGoogleIdToken } from "../integrations/google.client";
import {
  findUserByEmail,
  findUserByGoogleId,
  insertUser,
  linkGoogleId,
  type UserRow,
} from "../repositories/user.repository";
import { insertInitialBalances, insertWallet } from "../repositories/wallet.repository";
import type { LoginInput, RegisterInput } from "../schemas/auth.schema";
import type { AuthContext, PublicUser } from "../types/auth";
import { AppError } from "../utils/app-error";
import { revokeToken } from "./token-blacklist.service";

const BCRYPT_ROUNDS = 10;
// Hash de referencia para comparar cuando el email no existe (o la cuenta no tiene contraseña):
// así login tarda lo mismo en todos los casos y no se puede adivinar qué emails están registrados.
const DUMMY_HASH = bcrypt.hashSync("nexpay-dummy-password", BCRYPT_ROUNDS);
const PG_UNIQUE_VIOLATION = "23505";

export interface AuthResult {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
}

export interface GoogleAuthResult extends AuthResult {
  /** true si la cuenta se creó en esta petición. */
  isNewUser: boolean;
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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION;
}

function assertCanLogin(user: UserRow): void {
  if (user.deleted_at !== null) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
  }
  if (user.status !== "active") {
    throw new AppError(403, "ACCOUNT_DISABLED", "La cuenta está suspendida o cerrada");
  }
}

/**
 * Crea el usuario y su wallet con un balance en 0 por cada moneda activa.
 * Todo ocurre en una sola transacción SQL: si algo falla, no queda un usuario sin wallet.
 */
function createUserWithWallet(data: Parameters<typeof insertUser>[1]): Promise<UserRow> {
  return withTransaction(async (client) => {
    const created = await insertUser(client, data);
    const walletId = await insertWallet(client, created.id);
    await insertInitialBalances(client, walletId);
    return created;
  });
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const user = await createUserWithWallet({ fullName: input.fullName, email: input.email, passwordHash });
    return issueToken(user);
  } catch (err) {
    // La restricción UNIQUE(email) de la base de datos es la fuente de verdad (evita carreras).
    if (isUniqueViolation(err)) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ya existe una cuenta con ese email");
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  // Las cuentas creadas con Google no tienen contraseña: se compara contra el hash de referencia y falla.
  const passwordOk = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !user.password_hash || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
  }
  assertCanLogin(user);
  return issueToken(user);
}

/**
 * Login con Google. Tres casos:
 * 1. Ya entró antes con Google (google_id conocido) → inicia sesión.
 * 2. Tiene cuenta con el mismo email (verificado por Google) → se vincula y inicia sesión.
 * 3. No tiene cuenta → se crea usuario + wallet + balances, sin contraseña.
 */
export async function loginWithGoogle(idToken: string): Promise<GoogleAuthResult> {
  const profile = await verifyGoogleIdToken(idToken);

  let isNewUser = false;
  let user = await findUserByGoogleId(profile.googleId);

  if (!user) {
    const byEmail = await findUserByEmail(profile.email);
    if (byEmail) {
      if (byEmail.google_id && byEmail.google_id !== profile.googleId) {
        throw new AppError(409, "EMAIL_LINKED_TO_OTHER_GOOGLE", "Ese email ya está vinculado a otra cuenta de Google");
      }
      user = await linkGoogleId(byEmail.id, profile.googleId);
    } else {
      try {
        user = await createUserWithWallet({
          fullName: profile.fullName,
          email: profile.email,
          passwordHash: null,
          googleId: profile.googleId,
        });
        isNewUser = true;
      } catch (err) {
        // Dos peticiones simultáneas del mismo usuario: la otra ya lo creó.
        if (!isUniqueViolation(err)) throw err;
        user = await findUserByGoogleId(profile.googleId);
        if (!user) throw err;
      }
    }
  }

  assertCanLogin(user);
  return { ...issueToken(user), isNewUser };
}

export function logout(auth: AuthContext): void {
  revokeToken(auth.jti, auth.exp);
}
