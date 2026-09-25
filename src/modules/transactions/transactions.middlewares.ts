import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;
const currencyCodeRegex = /^[A-Z0-9]{3,10}$/;

const transactionTypeSchema = z.enum(["BUYSELL_EXCHANGE", "DEPOSIT", "WITHDRAWAL", "TRANSFER"]);

const createTransactionSchema = z.object({
  wallet_id: z.string().trim().regex(uuidRegex, "El id de la wallet no es válido"),
  type: transactionTypeSchema,
  from_currency: z.string().trim().min(3, "La moneda origen es obligatoria").max(10, "La moneda origen es demasiado larga").regex(currencyCodeRegex, "La moneda origen no es válida").transform((value) => value.toUpperCase()),
  to_currency: z.string().trim().min(3, "La moneda destino es obligatoria").max(10, "La moneda destino es demasiado larga").regex(currencyCodeRegex, "La moneda destino no es válida").transform((value) => value.toUpperCase()),
  from_amount: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El monto origen debe ser un número válido"),
    z.number().nonnegative("El monto origen no puede ser negativo"),
  ]).transform((value) => String(value)),
  to_amount: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El monto destino debe ser un número válido"),
    z.number().nonnegative("El monto destino no puede ser negativo"),
  ]).transform((value) => String(value)),
  exchange_rate: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El tipo de cambio debe ser un número válido"),
    z.number().positive("El tipo de cambio debe ser positivo"),
  ]).transform((value) => String(value)),
});

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
