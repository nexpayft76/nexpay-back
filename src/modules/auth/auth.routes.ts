import { Router } from "express";

import { rateLimit } from "../../middlewares/rate-limit.middleware";
import {
  emailAvailable,
  login,
  logout,
  me,
  register,
  requestPasswordReset,
  resetPassword,
  session,
} from "./auth.controller";
import {
  optionalAuth,
  requireAuth,
  validateLogin,
  validatePasswordReset,
  validatePasswordResetRequest,
  validateRegister,
} from "./auth.middlewares";

export const authRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     PublicUser:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         full_name: { type: string, example: "Ana Pérez" }
 *         email: { type: string, format: email, example: "ana@nexpay.com" }
 *         status: { type: string, enum: [active, suspended, closed] }
 *         created_at: { type: string, format: date-time }
 *     AuthResult:
 *       type: object
 *       properties:
 *         token: { type: string, example: "eyJhbGciOiJIUzI1NiIs..." }
 *         token_type: { type: string, example: Bearer }
 *         expires_in: { type: integer, description: "Segundos hasta que expira el token", example: 3600 }
 *         user: { $ref: "#/components/schemas/PublicUser" }
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error: { type: string, example: INVALID_CREDENTIALS }
 *         message: { type: string, example: "Email o contraseña incorrectos" }
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               path: { type: string, example: email }
 *               message: { type: string, example: "El email no es válido" }
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Registra un usuario y crea su wallet con balances en 0
 *     description: Contraseña con bcrypt. Usuario, wallet y balances se crean en una sola transacción SQL. Devuelve un JWT.
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, password]
 *             properties:
 *               full_name: { type: string, minLength: 2, maxLength: 120, example: "Ana Pérez" }
 *               email: { type: string, format: email, example: "ana@nexpay.com" }
 *               password: { type: string, minLength: 8, maxLength: 72, description: "Al menos una letra y un número", example: "Secreta123" }
 *     responses:
 *       201:
 *         description: Usuario creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: "#/components/schemas/AuthResult" }
 *       400:
 *         description: Datos inválidos
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       409:
 *         description: El email ya está registrado (EMAIL_ALREADY_REGISTERED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados intentos desde la misma IP (TOO_MANY_REQUESTS); máximo 5 por minuto
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
authRouter.post("/register", rateLimit({ windowMs: 60_000, max: 5 }), validateRegister, register);

/**
 * @openapi
 * /api/auth/email-available:
 *   get:
 *     summary: ¿El email está libre para registrarse?
 *     description: |
 *       Para validar el formulario de registro en tiempo real (antes de enviarlo).
 *       Limitado a 20 consultas por minuto por IP, para que no sirva para averiguar emails en masa.
 *       El registro igual vuelve a verificarlo (409 EMAIL_ALREADY_REGISTERED).
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - { in: query, name: email, required: true, schema: { type: string, format: email, example: "ana@nexpay.com" } }
 *     responses:
 *       200:
 *         description: Resultado de la consulta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     email: { type: string, example: "ana@nexpay.com" }
 *                     available: { type: boolean, example: false }
 *       400:
 *         description: Email inválido (INVALID_EMAIL_QUERY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiadas consultas (TOO_MANY_REQUESTS)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
authRouter.get("/email-available", rateLimit({ windowMs: 60_000, max: 20 }), emailAvailable);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Inicia sesión (deja la cookie de sesión HttpOnly y devuelve el JWT)
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: "ana@nexpay.com" }
 *               password: { type: string, example: "Secreta123" }
 *     responses:
 *       200:
 *         description: Login correcto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: "#/components/schemas/AuthResult" }
 *       400:
 *         description: Datos inválidos
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Email o contraseña incorrectos (INVALID_CREDENTIALS)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       403:
 *         description: Cuenta suspendida o cerrada (ACCOUNT_DISABLED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados intentos desde la misma IP (TOO_MANY_REQUESTS); máximo 10 por minuto
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
// Límite por IP contra la prueba masiva de contraseñas (fuerza bruta).
authRouter.post("/login", rateLimit({ windowMs: 60_000, max: 10 }), validateLogin, login);

/**
 * @openapi
 * /api/auth/password-reset/request:
 *   post:
 *     summary: Solicita por email un enlace para restablecer la contraseña
 *     description: Siempre responde con el mismo mensaje para no revelar si el email está registrado. Máximo 5 solicitudes cada 15 minutos por IP.
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: "ana@nexpay.com" }
 *     responses:
 *       200:
 *         description: Solicitud recibida
 *       400:
 *         description: Email inválido
 *       429:
 *         description: Demasiadas solicitudes desde la misma IP
 */
authRouter.post(
  "/password-reset/request",
  rateLimit({ windowMs: 15 * 60_000, max: 5 }),
  validatePasswordResetRequest,
  requestPasswordReset,
);

/**
 * @openapi
 * /api/auth/password-reset/confirm:
 *   post:
 *     summary: Cambia la contraseña usando un enlace vigente de un solo uso
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, new_password]
 *             properties:
 *               token: { type: string, description: "Token recibido por email" }
 *               new_password: { type: string, minLength: 8, maxLength: 72, description: "Al menos una letra y un número" }
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       400:
 *         description: Datos inválidos o token vencido/usado
 *       429:
 *         description: Demasiadas solicitudes desde la misma IP
 */
authRouter.post(
  "/password-reset/confirm",
  rateLimit({ windowMs: 60_000, max: 10 }),
  validatePasswordReset,
  resetPassword,
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Cierra la sesión, invalida el token actual y borra la cookie
 *     description: No responde 401 aunque la sesión ya haya vencido (así el logout no deja errores en la consola).
 *     tags: [Auth]
 *     responses:
 *       204:
 *         description: Sesión cerrada; el token deja de servir y la cookie se borra
 */
authRouter.post("/logout", optionalAuth, logout);

/**
 * @openapi
 * /api/auth/session:
 *   get:
 *     summary: ¿Hay una sesión iniciada?
 *     description: |
 *       Responde 200 siempre: el usuario y cuándo vence la sesión, o `null` si no hay sesión.
 *       El front lo usa al cargar la página (en vez de /me, que responde 401 sin sesión).
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Estado de la sesión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   nullable: true
 *                   type: object
 *                   properties:
 *                     user: { $ref: "#/components/schemas/PublicUser" }
 *                     expires_at: { type: string, format: date-time }
 */
authRouter.get("/session", optionalAuth, session);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Devuelve el usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: "#/components/schemas/PublicUser" }
 *       401:
 *         description: Token ausente, inválido, expirado o revocado (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
authRouter.get("/me", requireAuth, me);
