import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../utils/app-error";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;
const currencyCodeRegex = /^[A-Z0-9]{3,10}$/i;

const transactionTypeSchema = z.enum(["BUY", "SELL", "EXCHANGE", "DEPOSIT", "P2P"]);

const currencyField = (label: string) =>
  z
    .string({ error: `La moneda ${label} es obligatoria` })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, `La moneda ${label} debe ser un código de 3 letras, ej. COP`);

/**
 * Compra, venta o intercambio. No se aceptan wallet_id ni exchange_rate: la wallet sale del token
 * y la tasa la calcula el servidor. El blue no se ofrece para operar porque es un mercado informal.
 */
const exchangeSchema = z
  .object({
    from_currency: currencyField("de origen"),
    to_currency: currencyField("de destino"),
    amount: z.coerce
      .number({ error: "El monto debe ser un número" })
      .positive("El monto debe ser mayor que 0"),
    ars_rate: z.enum(["oficial", "mep"], { error: "ars_rate debe ser oficial o mep" }).default("mep"),
  })
  .strict()
  .refine((input) => input.from_currency !== input.to_currency, {
    path: ["to_currency"],
    message: "La moneda de destino debe ser distinta a la de origen",
  });

export type ExchangeBody = z.output<typeof exchangeSchema>;

function parseExchange(value: unknown): ExchangeBody {
  const result = exchangeSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_EXCHANGE_PAYLOAD",
      "Datos de la operación inválidos",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

/** Valida el body de POST /api/transactions/me/exchange. */
export function validateExchange(req: Request, _res: Response, next: NextFunction): void {
  req.body = parseExchange(req.body);
  next();
}

/** Valida `?from_currency&to_currency&amount&ars_rate` (Express 5: req.query es de solo lectura). */
export function parseExchangeQuery(query: unknown): ExchangeBody {
  return parseExchange(query);
}

const createTransactionSchema = z.object({
  wallet_id: z.string().trim().regex(uuidRegex, "El id de la wallet no es válido"),
  type: transactionTypeSchema,
  from_currency: z.string().trim().min(3, "La moneda origen es obligatoria").max(10, "La moneda origen es demasiado larga").regex(currencyCodeRegex, "La moneda origen no es válida").transform((value) => value.toUpperCase()).nullable().optional(),
  to_currency: z.string().trim().min(3, "La moneda destino es obligatoria").max(10, "La moneda destino es demasiado larga").regex(currencyCodeRegex, "La moneda destino no es válida").transform((value) => value.toUpperCase()),
  from_amount: z.union([
    z.string().regex(/^(?=.*[1-9])\d+(\.\d+)?$/, "El monto origen debe ser mayor que 0"),
    z.number().positive("El monto origen debe ser mayor que 0"),
  ]).transform((value) => String(value)),
  to_amount: z.union([
    z.string().regex(/^(?=.*[1-9])\d+(\.\d+)?$/, "El monto destino debe ser mayor que 0"),
    z.number().positive("El monto destino debe ser mayor que 0"),
  ]).transform((value) => String(value)),
  exchange_rate: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El tipo de cambio debe ser un número válido"),
    z.number().positive("El tipo de cambio debe ser positivo"),
  ]).transform((value) => String(value)),
}).superRefine((input, context) => {
  if (input.type === "DEPOSIT" && input.from_currency !== undefined && input.from_currency !== null) {
    context.addIssue({
      code: "custom",
      path: ["from_currency"],
      message: "from_currency debe ser null para una recarga",
    });
  }

  if (input.type !== "DEPOSIT" && !input.from_currency) {
    context.addIssue({
      code: "custom",
      path: ["from_currency"],
      message: "La moneda origen es obligatoria para este tipo de transacción",
    });
  }
}).transform((input) => ({
  ...input,
  from_currency: input.type === "DEPOSIT" ? null : input.from_currency!,
}));

export function validateCreateTransaction(req: Request, res: Response, next: NextFunction): void {
  const result = createTransactionSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_TRANSACTION_PAYLOAD",
      message: "Datos de la transacción inválidos",
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  req.body = result.data;
  next();
}

export function validateTransactionId(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id ?? "");

  if (!id || !uuidRegex.test(id)) {
    res.status(400).json({
      error: "INVALID_TRANSACTION_ID",
      message: "El id de la transacción no es válido",
    });
    return;
  }

  next();
}
