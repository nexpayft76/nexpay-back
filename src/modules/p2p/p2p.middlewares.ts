import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../utils/app-error";
import { pageSchema } from "../transactions/transactions.middlewares";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const currencyField = (label: string) =>
  z
    .string({ error: `La moneda ${label} es obligatoria` })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, `La moneda ${label} debe ser un código de 3 letras, ej. COP`);

/** Oferta P2P: qué vende, qué quiere recibir, cuánto y a qué tasa. La wallet sale del token. */
const offerSchema = z
  .object({
    sell_currency: currencyField("que vendes"),
    buy_currency: currencyField("que quieres recibir"),
    sell_amount: z.coerce.number({ error: "El monto debe ser un número" }).positive("El monto debe ser mayor que 0"),
    rate: z.coerce.number({ error: "La tasa debe ser un número" }).positive("La tasa debe ser mayor que 0"),
  })
  .strict()
  .refine((input) => input.sell_currency !== input.buy_currency, {
    path: ["buy_currency"],
    message: "La moneda que recibes debe ser distinta a la que vendes",
  });

export type OfferBody = z.output<typeof offerSchema>;

function parseOffer(value: unknown): OfferBody {
  const result = offerSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_P2P_PAYLOAD",
      "Datos de la oferta inválidos",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

/** Valida el body de POST /api/p2p/offers. */
export function validateOffer(req: Request, _res: Response, next: NextFunction): void {
  req.body = parseOffer(req.body);
  next();
}

/** Simulación: igual que la oferta, pero sin tasa usa la del mercado (para precargarla en el formulario). */
const quoteSchema = z
  .object({
    sell_currency: currencyField("que vendes"),
    buy_currency: currencyField("que quieres recibir"),
    sell_amount: z.coerce.number({ error: "El monto debe ser un número" }).positive("El monto debe ser mayor que 0"),
    rate: z.coerce.number({ error: "La tasa debe ser un número" }).positive("La tasa debe ser mayor que 0").optional(),
  })
  .strict()
  .refine((input) => input.sell_currency !== input.buy_currency, {
    path: ["buy_currency"],
    message: "La moneda que recibes debe ser distinta a la que vendes",
  });

export type QuoteQuery = z.output<typeof quoteSchema>;

/** Valida la query de GET /api/p2p/quote (Express 5: req.query es de solo lectura). */
export function parseOfferQuery(query: unknown): QuoteQuery {
  const result = quoteSchema.safeParse(query);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_P2P_PAYLOAD",
      "Datos de la oferta inválidos",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

/** Valida el body de una oferta (lo usan los tests). */
export function parseOfferBody(value: unknown): OfferBody {
  return parseOffer(value);
}

const marketFilterSchema = z
  .object({
    sell_currency: currencyField("que se vende").optional(),
    buy_currency: currencyField("que se recibe").optional(),
  })
  .strict();

/** Filtros opcionales del mercado: ?sell_currency=USD&buy_currency=COP. */
export function parseMarketFilters(query: unknown): z.output<typeof marketFilterSchema> {
  const result = marketFilterSchema.safeParse(query);
  if (!result.success) {
    throw new AppError(400, "INVALID_P2P_FILTERS", "Filtros inválidos", result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

const tradesPageSchema = pageSchema.strict();

/** Página del historial de intercambios: ?page=1&limit=20. */
export function parseTradesPage(query: unknown): z.output<typeof tradesPageSchema> {
  const result = tradesPageSchema.safeParse(query);
  if (!result.success) {
    throw new AppError(400, "INVALID_HISTORY_QUERY", "Filtros del historial inválidos", result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

export function validateOfferId(req: Request, _res: Response, next: NextFunction): void {
  if (!uuidRegex.test(String(req.params.id ?? ""))) {
    throw new AppError(400, "INVALID_OFFER_ID", "El id de la oferta no es válido");
  }
  next();
}
