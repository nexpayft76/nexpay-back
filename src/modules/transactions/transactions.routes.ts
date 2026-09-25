import { Router } from "express";

import { createTransaction, deleteTransaction, getTransaction, listTransactions } from "./transactions.controller";

export const transactionsRouter = Router();

transactionsRouter.get("/", listTransactions);
transactionsRouter.get("/:id", getTransaction);
transactionsRouter.post("/", createTransaction);
transactionsRouter.delete("/:id", deleteTransaction);
