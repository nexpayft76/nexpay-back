import { Router } from "express";

import { createWallet, deleteWallet, getWallet, getWalletByUser, listWallets } from "./wallets.controller";
import { validateCreateWallet, validateUserId, validateWalletId } from "./wallets.middlewares";

export const walletsRouter = Router();

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
 * /api/wallets:
 *   post:
 *     summary: Crear wallet
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       201:
 *         description: Wallet creada
 */
walletsRouter.post("/", validateCreateWallet, createWallet);

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
 *   delete:
 *     summary: Eliminar wallet
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       204:
 *         description: Wallet eliminada
 *       404:
 *         description: Wallet no encontrada
 */
walletsRouter.get("/:id", validateWalletId, getWallet);
walletsRouter.delete("/:id", validateWalletId, deleteWallet);
