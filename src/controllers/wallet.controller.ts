import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import { walletQuerySchema } from "../schemas/rates.schema";
import * as walletService from "../services/wallet.service";
import { parseInput } from "../utils/validation";

export async function getMyWallet(req: Request, res: Response): Promise<void> {
  const { valuedIn } = parseInput(walletQuerySchema, req.query);
  res.status(200).json(await walletService.getWallet(getAuth(req).userId, valuedIn));
}
