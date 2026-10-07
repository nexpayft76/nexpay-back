import { Router } from "express";

import {
  changeMyPassword,
  closeMyAccount,
  deleteUser,
  getMyPreferences,
  getMyTheme,
  getUser,
  listUsers,
  updateMe,
  updateMyPreferences,
  updateMyTheme,
  updateUser,
} from "./users.controller";
import {
  validateChangePassword,
  validateCloseAccount,
  validatePreferences,
  validateTheme,
  validateUpdateMe,
  validateUpdateUser,
  validateUserId,
} from "./users.middlewares";
import { rateLimit } from "../../middlewares/rate-limit.middleware";
import { requireSuperuser, requireAuth } from "../auth/auth.middlewares";

export const usersRouter = Router();

/**
 * @openapi
 * /api/users/me/theme:
 *   get:
 *     summary: Obtener mi tema de interfaz
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Tema actual del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     theme: { type: string, enum: [light, dark] }
 *       404: { description: Usuario no encontrado }
 *   patch:
 *     summary: Cambiar mi tema de interfaz
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [theme]
 *             properties:
 *               theme: { type: string, enum: [light, dark] }
 *     responses:
 *       200: { description: Tema actualizado }
 *       400:
 *         description: Tema inválido (INVALID_THEME)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       404: { description: Usuario no encontrado }
 */
usersRouter.get("/me/theme", requireAuth, getMyTheme);
usersRouter.patch("/me/theme", requireAuth, validateTheme, updateMyTheme);

/**
 * @openapi
 * /api/users/me/preferences:
 *   get:
 *     summary: Obtener mis preferencias
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Preferencias del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     theme: { type: string, enum: [light, dark] }
 *                     in_app_notifications: { type: boolean }
 *                     email_notifications: { type: boolean }
 *       404: { description: Usuario no encontrado }
 *   patch:
 *     summary: Actualizar mis preferencias
 *     description: Se pueden enviar uno o más campos.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme: { type: string, enum: [light, dark] }
 *               in_app_notifications: { type: boolean }
 *               email_notifications: { type: boolean }
 *     responses:
 *       200: { description: Preferencias actualizadas }
 *       400:
 *         description: Preferencias inválidas (INVALID_PREFERENCES)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       404: { description: Usuario no encontrado }
 */
usersRouter.get("/me/preferences", requireAuth, getMyPreferences);
usersRouter.patch("/me/preferences", requireAuth, validatePreferences, updateMyPreferences);

/**
 * @openapi
 * /api/users/me:
 *   patch:
 *     summary: Edita el nombre y/o el email del usuario autenticado
 *     description: |
 *       Solo acepta `full_name` y `email` (cualquier otro campo, como `status`, responde 400).
 *       Hay que enviar al menos uno. El email se guarda en minúsculas.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, minLength: 2, maxLength: 120, example: "Ana Pérez" }
 *               email: { type: string, format: email, example: "ana@nexpay.com" }
 *     responses:
 *       200:
 *         description: Datos actualizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: "#/components/schemas/PublicUser" }
 *       400:
 *         description: Datos inválidos (INVALID_PROFILE_PAYLOAD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Sin sesión o el usuario ya no existe (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       409:
 *         description: El email ya lo usa otra cuenta (EMAIL_ALREADY_REGISTERED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados intentos desde la misma IP (TOO_MANY_REQUESTS); máximo 20 por minuto
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
usersRouter.patch("/me", rateLimit({ windowMs: 60_000, max: 20 }), validateUpdateMe, updateMe);

/**
 * @openapi
 * /api/users/me/password:
 *   patch:
 *     summary: Cambia la contraseña del usuario autenticado
 *     description: |
 *       Pide la contraseña actual para confirmar. La nueva sigue las mismas reglas del registro
 *       (8-72 caracteres, al menos una letra y un número) y debe ser distinta de la actual.
 *       La contraseña actual incorrecta responde **403** (no 401), para que el front no lo confunda con una sesión vencida.
 *       La sesión actual sigue vigente.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password: { type: string, example: "Secreta123" }
 *               new_password: { type: string, minLength: 8, maxLength: 72, example: "NuevaSecreta456" }
 *     responses:
 *       204:
 *         description: Contraseña actualizada
 *       400:
 *         description: Datos inválidos (INVALID_CHANGE_PASSWORD_PAYLOAD) o nueva igual a la actual (PASSWORD_UNCHANGED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Sin sesión o el usuario ya no existe (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       403:
 *         description: Contraseña actual incorrecta (INVALID_PASSWORD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       409:
 *         description: La cuenta no tiene contraseña, p. ej. creada con Google (PASSWORD_NOT_SET)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados intentos desde la misma IP (TOO_MANY_REQUESTS); máximo 5 por minuto
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
// Límite por IP: la contraseña actual se verifica aquí, así que no debe servir para probarlas en masa.
usersRouter.patch("/me/password", rateLimit({ windowMs: 60_000, max: 5 }), validateChangePassword, changeMyPassword);

/**
 * @openapi
 * /api/users/me:
 *   delete:
 *     summary: Cierra la cuenta del usuario autenticado
 *     description: |
 *       Borrado lógico: la cuenta queda cerrada y ya no puede iniciar sesión. Las cuentas con contraseña
 *       deben enviarla para confirmar; las cuentas creadas con Google pueden omitirla. Exige saldos en 0.
 *       Invalida el token actual y borra la cookie.
 *       La contraseña incorrecta responde **403** (no 401), para que el front no lo confunda con una sesión vencida.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string, minLength: 1, description: "Obligatoria para cuentas con contraseña; opcional para cuentas creadas con Google", example: "Secreta123" }
 *     responses:
 *       204:
 *         description: Cuenta cerrada; el token deja de servir y la cookie se borra
 *       400:
 *         description: El cuerpo de la solicitud es inválido (INVALID_CLOSE_ACCOUNT_PAYLOAD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Sin sesión o el usuario ya no existe (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       403:
 *         description: Contraseña incorrecta (INVALID_PASSWORD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       409:
 *         description: Todavía hay saldo en la billetera (ACCOUNT_HAS_BALANCE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados intentos desde la misma IP (TOO_MANY_REQUESTS); máximo 5 por minuto
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
// Límite por IP: la contraseña se verifica aquí, así que no debe servir para probarlas en masa con una sesión robada.
usersRouter.delete("/me", rateLimit({ windowMs: 60_000, max: 5 }), validateCloseAccount, closeMyAccount);

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Obtener todos los usuarios
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Lista de usuarios
 */
usersRouter.get("/", requireSuperuser, listUsers);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Obtener un usuario por id
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.get("/:id", requireSuperuser, validateUserId, getUser);

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     summary: Actualizar un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended, closed]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.patch("/:id", requireSuperuser, validateUserId, validateUpdateUser, updateUser);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Eliminar un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     responses:
 *       204:
 *         description: Usuario eliminado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.delete("/:id", requireSuperuser, validateUserId, deleteUser);
