import type { Request, Response } from "express";
import { parseConvertQuery, parseRatesQuery } from "./rates.middlewares";
import { ratesService } from "./rates.service";

export async function getRates(req: Request, res: Response): Promise<void> {
  const { base } = parseRatesQuery(req.query);
  res.status(200).json({ data: await ratesService.getRates(base) });
}

export async function getArsRates(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await ratesService.getArsRates() });
}

export async function convert(req: Request, res: Response): Promise<void> {
  const { from, to, amount, ars_rate } = parseConvertQuery(req.query);
  res.status(200).json({ data: await ratesService.convert(from, to, amount, ars_rate) });
}
