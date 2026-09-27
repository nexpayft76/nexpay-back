import { Router } from "express";

import { getTransaction, listTransactions } from "./transactions.controller";
import { validateTransactionId } from "./transactions.middlewares";

export const transactionsRouter = Router();

/**
 * @openapi
 * /api/transactions:
 *   get:
 *     summary: Listar transacciones
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Lista de transacciones
 */
transactionsRouter.get("/", listTransactions);

/**
 * @openapi
 * /api/transactions/{id}:
 *   get:
 *     summary: Obtener transacción por id
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Transacción encontrada
 *       404:
 *         description: Transacción no encontrada
 */
transactionsRouter.get("/:id", validateTransactionId, getTransaction);
