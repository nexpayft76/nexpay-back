import { Router } from "express";

import { createBalance, deleteBalance, getBalance, getBalanceByWalletCurrency, listBalances, updateBalance } from "./balances.controller";

export const balancesRouter = Router();

/**
 * @openapi
 * /api/balances:
 *   get:
 *     summary: Listar balances
 *     tags: [Balances]
 *   post:
 *     summary: Crear balance
 *     tags: [Balances]
 */
balancesRouter.get("/", listBalances);
balancesRouter.post("/", createBalance);

/**
 * @openapi
 * /api/balances/wallet/{walletId}/currency/{currencyCode}:
 *   get:
 *     summary: Obtener balance por wallet y moneda
 *     tags: [Balances]
 * /api/balances/{id}:
 *   get:
 *     summary: Obtener balance por id
 *     tags: [Balances]
 *   patch:
 *     summary: Actualizar balance
 *     tags: [Balances]
 *   delete:
 *     summary: Eliminar balance
 *     tags: [Balances]
 */
balancesRouter.get("/wallet/:walletId/currency/:currencyCode", getBalanceByWalletCurrency);
balancesRouter.get("/:id", getBalance);
balancesRouter.patch("/:id", updateBalance);
balancesRouter.delete("/:id", deleteBalance);
