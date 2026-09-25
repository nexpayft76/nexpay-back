import { Router } from "express";

import { createBalance, deleteBalance, getBalance, getBalanceByWalletCurrency, listBalances, updateBalance } from "./balances.controller";
import { validateBalanceId, validateCreateBalance, validateUpdateBalance, validateWalletCurrencyParams } from "./balances.middlewares";

export const balancesRouter = Router();

/**
 * @openapi
 * /api/balances:
 *   get:
 *     summary: Listar balances
 *     tags: [Balances]
 *     responses:
 *       200:
 *         description: Lista de balances
 */
balancesRouter.get("/", listBalances);

/**
 * @openapi
 * /api/balances:
 *   post:
 *     summary: Crear balance
 *     tags: [Balances]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wallet_id, currency_code, amount]
 *             properties:
 *               wallet_id:
 *                 type: string
 *               currency_code:
 *                 type: string
 *               amount:
 *                 type: string
 *     responses:
 *       201:
 *         description: Balance creado
 */
balancesRouter.post("/", validateCreateBalance, createBalance);

/**
 * @openapi
 * /api/balances/wallet/{walletId}/currency/{currencyCode}:
 *   get:
 *     summary: Obtener balance por wallet y moneda
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: walletId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: currencyCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance encontrado
 *       404:
 *         description: Balance no encontrado
 */
balancesRouter.get("/wallet/:walletId/currency/:currencyCode", validateWalletCurrencyParams, getBalanceByWalletCurrency);

/**
 * @openapi
 * /api/balances/{id}:
 *   get:
 *     summary: Obtener balance por id
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance encontrado
 *       404:
 *         description: Balance no encontrado
 *   patch:
 *     summary: Actualizar balance
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance actualizado
 *   delete:
 *     summary: Eliminar balance
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Balance eliminado
 */
balancesRouter.get("/:id", validateBalanceId, getBalance);
balancesRouter.patch("/:id", validateBalanceId, validateUpdateBalance, updateBalance);
balancesRouter.delete("/:id", validateBalanceId, deleteBalance);
