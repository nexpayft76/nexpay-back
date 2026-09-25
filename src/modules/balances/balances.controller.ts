import type { Request, Response } from "express";

import { balancesService } from "./balances.service";

export async function listBalances(_req: Request, res: Response): Promise<void> {
  const balances = await balancesService.listBalances();
  res.status(200).json({ data: balances });
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const balance = await balancesService.getBalanceById(id);

  if (!balance) {
    res.status(404).json({ error: "BALANCE_NOT_FOUND", message: "Balance no encontrado" });
    return;
  }

  res.status(200).json({ data: balance });
}

export async function getBalanceByWalletCurrency(req: Request, res: Response): Promise<void> {
  const walletId = String(req.params.walletId);
  const currencyCode = String(req.params.currencyCode);
  const balance = await balancesService.getBalanceByWalletAndCurrency(walletId, currencyCode);

  if (!balance) {
    res.status(404).json({ error: "BALANCE_NOT_FOUND", message: "No existe balance para esta wallet y moneda" });
    return;
  }

  res.status(200).json({ data: balance });
}

export async function createBalance(req: Request, res: Response): Promise<void> {
  const balance = await balancesService.createBalance(req.body);
  res.status(201).json({ data: balance });
}

export async function updateBalance(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const balance = await balancesService.updateBalance(id, req.body);

  if (!balance) {
    res.status(404).json({ error: "BALANCE_NOT_FOUND", message: "Balance no encontrado" });
    return;
  }

  res.status(200).json({ data: balance });
}

export async function deleteBalance(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const deleted = await balancesService.deleteBalance(id);

  if (!deleted) {
    res.status(404).json({ error: "BALANCE_NOT_FOUND", message: "Balance no encontrado" });
    return;
  }

  res.status(204).send();
}
