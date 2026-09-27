import type { Request, Response } from "express";

import { currenciesService } from "./currencies.service";

export async function listCurrencies(_req: Request, res: Response): Promise<void> {
  const currencies = await currenciesService.listCurrencies();
  res.status(200).json({ data: currencies });
}

export async function getCurrency(req: Request, res: Response): Promise<void> {
  const code = String(req.params.code);
  const currency = await currenciesService.getCurrencyByCode(code);

  if (!currency) {
    res.status(404).json({ error: "CURRENCY_NOT_FOUND", message: "Moneda no encontrada" });
    return;
  }

  res.status(200).json({ data: currency });
}

export async function createCurrency(req: Request, res: Response): Promise<void> {
  const currency = await currenciesService.createCurrency(req.body);
  res.status(201).json({ data: currency });
}

export async function updateCurrency(req: Request, res: Response): Promise<void> {
  const code = String(req.params.code);
  const currency = await currenciesService.updateCurrency(code, req.body);

  if (!currency) {
    res.status(404).json({ error: "CURRENCY_NOT_FOUND", message: "Moneda no encontrada" });
    return;
  }

  res.status(200).json({ data: currency });
}

export async function deleteCurrency(req: Request, res: Response): Promise<void> {
  const code = String(req.params.code);
  const deleted = await currenciesService.deleteCurrency(code);

  if (!deleted) {
    res.status(404).json({ error: "CURRENCY_NOT_FOUND", message: "Moneda no encontrada" });
    return;
  }

  res.status(204).send();
}
