import type { Request, Response } from "express";

import { getAuth } from "../auth/auth.middlewares";
import { parseExchangeQuery, parseHistoryQuery, type ExchangeBody } from "./transactions.middlewares";
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

/** Historial de la cuenta del usuario autenticado (recargas, compras, ventas e intercambios), paginado. */
export async function listMyTransactions(req: Request, res: Response): Promise<void> {
  const page = await transactionsService.listMine(getAuth(req).userId, parseHistoryQuery(req.query));
  res.status(200).json({ data: page });
}

/** Cotización exacta de un cambio (tasa + comisión), para mostrar antes de confirmar. */
export async function quoteExchange(req: Request, res: Response): Promise<void> {
  const quote = await transactionsService.quoteExchange(parseExchangeQuery(req.query));
  res.status(200).json({ data: quote });
}

/** Compra, venta o intercambio en la wallet del usuario autenticado (el usuario sale del token). */
export async function exchange(req: Request, res: Response): Promise<void> {
  const result = await transactionsService.exchange(getAuth(req).userId, req.body as ExchangeBody);
  res.status(201).json({ data: result });
}
