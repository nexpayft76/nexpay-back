import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";

import { AppError } from "../../utils/app-error";
import { notificationsService } from "../notifications";
import { BCRYPT_ROUNDS } from "../auth/auth.service";
import { authRepository } from "../auth/auth.repository";
import { revokeToken } from "../auth/auth.token-blacklist";
import type { AuthContext } from "../auth/auth.types";
import { usersRepository, type MyProfile, type UpdateUserInput, type UserTheme } from "./users.repository";

const PG_UNIQUE_VIOLATION = "23505";

export const usersService = {
  /** Edita nombre y/o email del propio usuario. Un email ya usado por otra cuenta responde 409. */
  async updateMe(userId: string, input: { full_name?: string; email?: string }): Promise<MyProfile> {
    let profile: MyProfile | null;
    try {
      profile = await usersRepository.updateProfile(userId, input);
    } catch (err) {
      // UNIQUE(email) en la BD es la fuente de verdad (evita carreras entre peticiones).
      if (err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION) {
        throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ya existe una cuenta con ese email");
      }
      throw err;
    }
    if (!profile) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    return profile;
  },

  /**
   * Cierra la cuenta del propio usuario: pide su contraseña, exige saldos en 0, hace el borrado lógico
   * y revoca el token actual. La contraseña incorrecta responde 403 y NO 401: el front trata cualquier
   * 401 como "sesión vencida" y cerraría la sesión de alguien que solo se equivocó al escribirla.
   */
  async closeMyAccount(auth: AuthContext, password?: string): Promise<void> {
    const user = await authRepository.findActiveById(auth.userId);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");

    // Las cuentas sin contraseña (creadas con Google) no tienen con qué confirmar: se omite el control.
    if (user.password_hash && (!password || !(await bcrypt.compare(password, user.password_hash)))) {
      throw new AppError(403, "INVALID_PASSWORD", "La contraseña es incorrecta");
    }

    const result = await usersRepository.close(auth.userId);
    if (result === "has_balance") {
      throw new AppError(
        409,
        "ACCOUNT_HAS_BALANCE",
        "No se puede cerrar la cuenta mientras tengas saldo. Retira o convierte tus fondos primero.",
      );
    }
    if (result === "not_found") throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");

    revokeToken(auth.jti, auth.exp);
  },

  /**
   * Cambia la contraseña del propio usuario. Pide la actual (403 si no coincide, por la misma razón que
   * en closeMyAccount: un 401 haría que el front cierre la sesión). La sesión actual sigue vigente.
   */
  async changeMyPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await authRepository.findActiveById(userId);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");

    // Las cuentas creadas con Google no tienen contraseña que cambiar.
    if (!user.password_hash) {
      throw new AppError(409, "PASSWORD_NOT_SET", "Tu cuenta no tiene contraseña: inicia sesión con Google");
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw new AppError(403, "INVALID_PASSWORD", "La contraseña actual es incorrecta");
    }
    if (currentPassword === newPassword) {
      throw new AppError(400, "PASSWORD_UNCHANGED", "La nueva contraseña debe ser distinta de la actual");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    if (!(await usersRepository.updatePasswordHash(userId, passwordHash))) {
      throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    }
    void notificationsService.sendPasswordChangedEmail({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    });
  },

  listUsers: () => usersRepository.findAll(),
  getUserById: (id: string) => usersRepository.findById(id),
  getThemeById: (id: string) => usersRepository.getThemeById(id),
  getPreferencesById: (id: string) => usersRepository.getPreferencesById(id),
  updateUser: (id: string, input: UpdateUserInput) => usersRepository.update(id, input),
  deleteUser: (id: string) => usersRepository.remove(id),
  updateTheme: (id: string, theme: UserTheme) => usersRepository.updateTheme(id, theme),
  updatePreferences: (id: string, input: Partial<{ theme: UserTheme; in_app_notifications: boolean; email_notifications: boolean }>) =>
    usersRepository.updatePreferences(id, input),
};
