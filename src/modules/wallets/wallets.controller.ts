import type { Request, Response } from "express";

import { getAuth } from "../auth/auth.middlewares";
import { parseMyWalletQuery } from "./wallets.middlewares";
import { walletsService, type DepositInput } from "./wallets.service";

/** La wallet del usuario autenticado: el usuario sale del token, nunca de un id enviado por el cliente. */
export async function getMyWallet(req: Request, res: Response): Promise<void> {
  const { valued_in } = parseMyWalletQuery(req.query);
  const wallet = await walletsService.getMyWallet(getAuth(req).userId, valued_in);
  res.status(200).json({ data: wallet });
}

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

/** Recarga ficticia en la wallet del usuario autenticado (el usuario sale del token). */
export async function depositToMyWallet(req: Request, res: Response): Promise<void> {
  const result = await walletsService.deposit(getAuth(req).userId, req.body as DepositInput);
  res.status(201).json({ data: result });
}
