import { Router } from "express";

import { login, logout, me, register } from "./auth.controller";
import { requireAuth, validateLogin, validateRegister } from "./auth.middlewares";

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
 */
authRouter.post("/register", validateRegister, register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Inicia sesión y devuelve un JWT
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
 */
authRouter.post("/login", validateLogin, login);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Cierra la sesión e invalida el token actual
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Sesión cerrada; el token deja de servir
 *       401:
 *         description: Token ausente, inválido, expirado o ya revocado (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
authRouter.post("/logout", requireAuth, logout);

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
