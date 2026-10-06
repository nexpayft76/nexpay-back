import type { Request, Response } from "express";

import { getAuth } from "../auth/auth.middlewares";
import { parseMarketFilters, parseOfferQuery, parseTradesPage, type OfferBody } from "./p2p.middlewares";
import { p2pService } from "./p2p.service";

/** Simula una oferta: tasa actual, límites, comisión y lo que recibe cada parte. No mueve saldos. */
export async function quote(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await p2pService.quote(parseOfferQuery(req.query)) });
}

/** Publica una oferta del usuario autenticado y retiene el monto en garantía. */
export async function createOffer(req: Request, res: Response): Promise<void> {
  const result = await p2pService.createOffer(getAuth(req).userId, req.body as OfferBody);
  res.status(201).json({ data: result });
}

/** Mercado: ofertas abiertas de otros usuarios. */
export async function listMarket(req: Request, res: Response): Promise<void> {
  const offers = await p2pService.listMarket(getAuth(req).userId, parseMarketFilters(req.query));
  res.status(200).json({ data: offers });
}

/** Historial de intercambios P2P completados del usuario autenticado. */
export async function listMyTrades(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await p2pService.listMyTrades(getAuth(req).userId, parseTradesPage(req.query)) });
}

/** Ofertas del usuario autenticado. */
export async function listMine(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await p2pService.listMine(getAuth(req).userId) });
}

/** Acepta una oferta: el intercambio se hace al instante. */
export async function acceptOffer(req: Request, res: Response): Promise<void> {
  const result = await p2pService.acceptOffer(getAuth(req).userId, String(req.params.id));
  res.status(200).json({ data: result });
}

/** Cancela una oferta propia y devuelve lo retenido. */
export async function cancelOffer(req: Request, res: Response): Promise<void> {
  const result = await p2pService.cancelOffer(getAuth(req).userId, String(req.params.id));
  res.status(200).json({ data: result });
}
