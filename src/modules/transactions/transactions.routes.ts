import { Router } from "express";

import { createTransaction, deleteTransaction, getTransaction, listTransactions } from "./transactions.controller";
import { validateCreateTransaction, validateTransactionId } from "./transactions.middlewares";

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
 * /api/transactions:
 *   post:
 *     summary: Crear transacción
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate]
 *             properties:
 *               wallet_id:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [BUYSELL_EXCHANGE, DEPOSIT, WITHDRAWAL, TRANSFER]
 *               from_currency:
 *                 type: string
 *               to_currency:
 *                 type: string
 *               from_amount:
 *                 type: string
 *               to_amount:
 *                 type: string
 *               exchange_rate:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transacción creada
 */
transactionsRouter.post("/", validateCreateTransaction, createTransaction);

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
 *   delete:
 *     summary: Eliminar transacción
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       204:
 *         description: Transacción eliminada
 */
transactionsRouter.get("/:id", validateTransactionId, getTransaction);
transactionsRouter.delete("/:id", validateTransactionId, deleteTransaction);
