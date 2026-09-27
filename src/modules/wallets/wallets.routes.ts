import { Router } from "express";

import { getMyWallet, getWallet, getWalletByUser, listWallets } from "./wallets.controller";
import { validateUserId, validateWalletId } from "./wallets.middlewares";

export const walletsRouter = Router();

/**
 * @openapi
 * /api/wallets/me:
 *   get:
 *     summary: Mi wallet con sus saldos y el total valorizado
 *     description: |
 *       El usuario se toma del token (nunca de un id enviado por el cliente).
 *       Devuelve un saldo por moneda y el total en `valued_in` con las tasas actuales.
 *       Si alguna tasa falla, el total se calcula con las demás y se explica en `warnings`.
 *     tags: [Wallets]
 *     parameters:
 *       - in: query
 *         name: valued_in
 *         schema: { type: string, default: USD, example: COP }
 *         description: Moneda en la que se calcula el total
 *     responses:
 *       200:
 *         description: Wallet con saldos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet_id: { type: string, format: uuid }
 *                     created_at: { type: string, format: date-time }
 *                     balances:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           currency: { type: string, example: ARS }
 *                           name: { type: string, example: "Peso argentino" }
 *                           decimals: { type: integer, example: 2 }
 *                           amount: { type: string, description: "Saldo exacto", example: "150000.00000000" }
 *                           value_in_target: { type: number, nullable: true, example: 96.72 }
 *                           updated_at: { type: string, format: date-time }
 *                     valuation:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         currency: { type: string, example: USD }
 *                         total: { type: number, example: 1096.72 }
 *                         rates_date: { type: string, example: "2026-09-26" }
 *                         rates_source: { $ref: "#/components/schemas/RatesSource" }
 *                         missing_currencies: { type: array, items: { type: string }, example: [] }
 *                         warnings: { $ref: "#/components/schemas/RateWarnings" }
 *       400:
 *         description: Moneda de valorización inválida o no soportada
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Token ausente, inválido, expirado o revocado (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       404:
 *         description: El usuario no tiene wallet (WALLET_NOT_FOUND)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
// Va antes de "/:id": si no, Express tomaría "me" como un id de wallet.
walletsRouter.get("/me", getMyWallet);

/**
 * @openapi
 * /api/wallets:
 *   get:
 *     summary: Obtener wallets
 *     tags: [Wallets]
 *     responses:
 *       200:
 *         description: Lista de wallets
 */
walletsRouter.get("/", listWallets);

/**
 * @openapi
 * /api/wallets/user/{userId}:
 *   get:
 *     summary: Obtener wallet por usuario
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Wallet del usuario
 *       404:
 *         description: Wallet no encontrada
 */
walletsRouter.get("/user/:userId", validateUserId, getWalletByUser);

/**
 * @openapi
 * /api/wallets/{id}:
 *   get:
 *     summary: Obtener wallet por id
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Wallet encontrada
 *       404:
 *         description: Wallet no encontrada
 */
walletsRouter.get("/:id", validateWalletId, getWallet);
