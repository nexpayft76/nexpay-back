import { Router } from "express";

import { createWallet, deleteWallet, getWallet, getWalletByUser, listWallets } from "./wallets.controller";

export const walletsRouter = Router();

/**
 * @openapi
 * /api/wallets:
 *   get:
 *     summary: Obtener wallets
 *     tags: [Wallets]
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
 */
walletsRouter.get("/", listWallets);
walletsRouter.post("/", createWallet);

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
 *   delete:
 *     summary: Eliminar wallet
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
walletsRouter.get("/user/:userId", getWalletByUser);
walletsRouter.get("/:id", getWallet);
walletsRouter.delete("/:id", deleteWallet);
