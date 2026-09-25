import type { Request, Response } from "express";

import { walletsService } from "./wallets.service";

export async function listWallets(_req: Request, res: Response): Promise<void> {
  const wallets = await walletsService.listWallets();
  res.status(200).json({ data: wallets });
}

export async function getWallet(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const wallet = await walletsService.getWalletById(id);

  if (!wallet) {
    res.status(404).json({ error: "WALLET_NOT_FOUND", message: "Wallet no encontrada" });
    return;
  }

  res.status(200).json({ data: wallet });
}

export async function getWalletByUser(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  const wallet = await walletsService.getWalletByUserId(userId);

  if (!wallet) {
    res.status(404).json({ error: "WALLET_NOT_FOUND", message: "No existe wallet para este usuario" });
    return;
  }

  res.status(200).json({ data: wallet });
}

export async function createWallet(req: Request, res: Response): Promise<void> {
  const wallet = await walletsService.createWallet(req.body);
  res.status(201).json({ data: wallet });
}

export async function deleteWallet(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const deleted = await walletsService.deleteWallet(id);

  if (!deleted) {
    res.status(404).json({ error: "WALLET_NOT_FOUND", message: "Wallet no encontrada" });
    return;
  }

  res.status(204).send();
}
