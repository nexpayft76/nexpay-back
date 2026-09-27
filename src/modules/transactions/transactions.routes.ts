import { Router } from "express";

import { buyCurrency, getTransaction, listTransactions } from "./transactions.controller";
import { validateBuyCurrency, validateTransactionId } from "./transactions.middlewares";

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
 * /api/transactions/buy:
 *   post:
 *     summary: Comprar una moneda usando el saldo de otra
 *     description: Debita from_amount, calcula to_amount aplicando exchange_rate y actualiza ambos balances y el historial de forma atómica. exchange_rate expresa unidades de moneda destino por cada unidad de moneda origen.
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wallet_id, from_currency, to_currency, from_amount, exchange_rate]
 *             properties:
 *               wallet_id:
 *                 type: string
 *                 format: uuid
 *               from_currency:
 *                 type: string
 *                 example: USD
 *               to_currency:
 *                 type: string
 *                 example: EUR
 *               from_amount:
 *                 type: string
 *                 example: "100.00"
 *               exchange_rate:
 *                 type: string
 *                 example: "0.92"
 *     responses:
 *       201:
 *         description: Compra registrada y balances actualizados
 *       400:
 *         description: Datos inválidos o monedas no disponibles
 *       409:
 *         description: Saldo insuficiente
 */
transactionsRouter.post("/buy", validateBuyCurrency, buyCurrency);

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
