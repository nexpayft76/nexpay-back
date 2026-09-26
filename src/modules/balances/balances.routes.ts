import { Router } from "express";

import { getBalance, getBalanceByWalletCurrency, listBalances } from "./balances.controller";
import { validateBalanceId, validateWalletCurrencyParams } from "./balances.middlewares";

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
 */
balancesRouter.get("/:id", validateBalanceId, getBalance);
