import type { Request, Response } from "express";

import { CurrencyPurchaseError } from "./transactions.repository";
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

export async function buyCurrency(req: Request, res: Response): Promise<void> {
  try {
    const purchase = await transactionsService.buyCurrency(req.body);
    res.status(201).json({ data: purchase });
  } catch (error) {
    if (error instanceof CurrencyPurchaseError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    throw error;
  }
}

