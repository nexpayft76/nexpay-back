import { Router } from "express";

import { createTransaction, deleteTransaction, getTransaction, listTransactions } from "./transactions.controller";

export const transactionsRouter = Router();

/**
 * @openapi
 * /api/transactions:
 *   get:
 *     summary: Listar transacciones
 *     tags: [Transactions]
 *   post:
 *     summary: Crear transacción
 *     tags: [Transactions]
 */
transactionsRouter.get("/", listTransactions);
transactionsRouter.post("/", createTransaction);

/**
 * @openapi
 * /api/transactions/{id}:
 *   get:
 *     summary: Obtener transacción por id
 *     tags: [Transactions]
 *   delete:
 *     summary: Eliminar transacción
 *     tags: [Transactions]
 */
transactionsRouter.get("/:id", getTransaction);
transactionsRouter.delete("/:id", deleteTransaction);
