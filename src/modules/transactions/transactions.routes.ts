import { Router } from "express";

import { exchange, getTransaction, listMyTransactions, listTransactions, quoteExchange } from "./transactions.controller";
import { validateExchange, validateTransactionId } from "./transactions.middlewares";
import { requireSuperuser } from "../auth/auth.middlewares";

export const transactionsRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ExchangeQuote:
 *       type: object
 *       properties:
 *         type: { type: string, enum: [BUY, SELL, EXCHANGE], description: "BUY = local → USD/EUR; SELL = USD/EUR → local; EXCHANGE = el resto" }
 *         from_currency: { type: string, example: COP }
 *         to_currency: { type: string, example: USD }
 *         from_amount: { type: string, description: "Total que se debita, comisión incluida", example: "1000000.00" }
 *         fee_percent: { type: number, example: 1 }
 *         fee_amount: { type: string, description: "Comisión, en la moneda de origen", example: "10000.00" }
 *         converted_amount: { type: string, description: "from_amount - fee_amount", example: "990000.00" }
 *         rate: { type: number, description: "Unidades de destino por 1 de origen (misma tasa que /api/rates/convert)", example: 0.0002551 }
 *         to_amount: { type: string, description: "Lo que se acredita", example: "252.55" }
 *         ars_rate:
 *           nullable: true
 *           description: Tipo de dólar y precio usado si participa ARS (recibir ARS = compra, pagar con ARS = venta)
 *         rates_date: { type: string, example: "2026-09-27" }
 *         rates_source: { $ref: "#/components/schemas/RatesSource" }
 *         warnings: { $ref: "#/components/schemas/RateWarnings" }
 */

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
transactionsRouter.get("/", requireSuperuser, listTransactions);

/**
 * @openapi
 * /api/transactions/me:
 *   get:
 *     summary: Historial de mi cuenta (recargas e intercambios de balance)
 *     description: Del más nuevo al más viejo, paginado. Los intercambios P2P están en GET /api/p2p/trades/me.
 *     tags: [Transactions]
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [DEPOSIT, EXCHANGE] }, description: "EXCHANGE = intercambios de balance (compra, venta e intercambio)" }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ items, page, limit, total }"
 */
transactionsRouter.get("/me", listMyTransactions);

/**
 * @openapi
 * /api/transactions/me/exchange/quote:
 *   get:
 *     summary: Cotizar una compra, venta o intercambio (sin mover saldos)
 *     description: Devuelve el detalle exacto que se aplicaría ahora (tasa del servidor y comisión), para mostrarlo antes de confirmar.
 *     tags: [Transactions]
 *     parameters:
 *       - { in: query, name: from_currency, required: true, schema: { type: string, example: COP } }
 *       - { in: query, name: to_currency, required: true, schema: { type: string, example: USD } }
 *       - { in: query, name: amount, required: true, schema: { type: number, example: 1000000 }, description: "Total a debitar, comisión incluida" }
 *       - { in: query, name: ars_rate, schema: { type: string, enum: [oficial, mep], default: mep } }
 *     responses:
 *       200:
 *         description: Cotización
 *         content: { application/json: { schema: { type: object, properties: { data: { $ref: "#/components/schemas/ExchangeQuote" } } } } }
 *       400:
 *         description: Datos inválidos, moneda no soportada, demasiados decimales o monto demasiado chico
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: Tasas no disponibles (RATES_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
transactionsRouter.get("/me/exchange/quote", quoteExchange);

/**
 * @openapi
 * /api/transactions/me/exchange:
 *   post:
 *     summary: Comprar, vender o intercambiar monedas en mi wallet
 *     description: |
 *       El usuario se toma del token y la tasa la calcula el servidor en el momento (nunca se aceptan wallet_id ni exchange_rate).
 *       Cobra la comisión EXCHANGE_FEE_PERCENT sobre el monto de origen (0 en la Demo 1: sin comisión). Debita, acredita y registra en una sola transacción SQL.
 *       Base: compra de monedas de Nelson (POST /buy), adaptada.
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from_currency, to_currency, amount]
 *             properties:
 *               from_currency: { type: string, example: COP }
 *               to_currency: { type: string, example: USD }
 *               amount: { type: number, description: "Total a debitar, comisión incluida", example: 1000000 }
 *               ars_rate: { type: string, enum: [oficial, mep], default: mep }
 *     responses:
 *       201:
 *         description: Operación aplicada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   allOf:
 *                     - $ref: "#/components/schemas/ExchangeQuote"
 *                     - type: object
 *                       properties:
 *                         transaction_id: { type: string, format: uuid }
 *                         created_at: { type: string, format: date-time }
 *                         balances:
 *                           type: object
 *                           description: Saldos después de la operación
 *                           properties:
 *                             from: { type: string, example: "0.00000000" }
 *                             to: { type: string, example: "252.55000000" }
 *       400:
 *         description: Datos inválidos, moneda no soportada, demasiados decimales o monto demasiado chico
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Token ausente, inválido, expirado o revocado (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       409:
 *         description: Saldo insuficiente (INSUFFICIENT_BALANCE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: Tasas no disponibles (RATES_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
transactionsRouter.post("/me/exchange", validateExchange, exchange);

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
// Las rutas "/me/..." van antes de "/:id": si no, Express tomaría "me" como un id.
transactionsRouter.get("/:id", requireSuperuser, validateTransactionId, getTransaction);
