import type { Request, Response } from "express";
import { convertQuerySchema, ratesQuerySchema } from "../schemas/rates.schema";
import * as ratesService from "../services/rates.service";
import { parseInput } from "../utils/validation";

export async function getRates(req: Request, res: Response): Promise<void> {
  const { base } = parseInput(ratesQuerySchema, req.query);
  res.status(200).json(await ratesService.getRates(base));
}

export async function convert(req: Request, res: Response): Promise<void> {
  const { from, to, amount } = parseInput(convertQuerySchema, req.query);
  res.status(200).json(await ratesService.convert(from, to, amount));
}
