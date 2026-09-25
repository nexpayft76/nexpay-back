import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import { walletQuerySchema } from "../schemas/rates.schema";
import type { DepositInput } from "../schemas/wallet.schema";
import * as walletService from "../services/wallet.service";
import { parseInput } from "../utils/validation";

export async function getMyWallet(req: Request, res: Response): Promise<void> {
  const { valuedIn } = parseInput(walletQuerySchema, req.query);
  res.status(200).json(await walletService.getWallet(getAuth(req).userId, valuedIn));
}

export async function deposit(req: Request, res: Response): Promise<void> {
  const result = await walletService.deposit(getAuth(req).userId, req.body as DepositInput);
  res.status(201).json(result);
}
