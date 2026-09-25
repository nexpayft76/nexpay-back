import type { Request, Response } from "express";

import { transactionsService } from "./transactions.service";

export async function listTransactions(_req: Request, res: Response): Promise<void> {
  const transactions = await transactionsService.listTransactions();
  res.status(200).json({ data: transactions });
}

export async function getTransaction(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const transaction = await transactionsService.getTransactionById(id);

  if (!transaction) {
    res.status(404).json({ error: "TRANSACTION_NOT_FOUND", message: "Transacción no encontrada" });
    return;
  }

  res.status(200).json({ data: transaction });
}

export async function createTransaction(req: Request, res: Response): Promise<void> {
  const transaction = await transactionsService.createTransaction(req.body);
  res.status(201).json({ data: transaction });
}

export async function deleteTransaction(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const deleted = await transactionsService.deleteTransaction(id);

  if (!deleted) {
    res.status(404).json({ error: "TRANSACTION_NOT_FOUND", message: "Transacción no encontrada" });
    return;
  }

  res.status(204).send();
}
