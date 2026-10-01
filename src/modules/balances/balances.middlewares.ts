import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const createBalanceSchema = z.object({
  wallet_id: z.string().trim().regex(uuidRegex, "El id de la wallet no es válido"),
  currency_code: z.string().trim().min(3, "El código de moneda es obligatorio").max(10, "El código de moneda es demasiado largo").toUpperCase(),
  amount: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El monto debe ser un número válido"),
    z.number().nonnegative("El monto no puede ser negativo"),
  ]).optional().transform((value) => (value === undefined ? "0" : String(value))),
});

const updateBalanceSchema = z.object({
  amount: z.union([
    z.string().regex(/^\d+(\.\d+)?$/, "El monto debe ser un número válido"),
    z.number().nonnegative("El monto no puede ser negativo"),
  ]).transform(String),
});

export function validateCreateBalance(req: Request, res: Response, next: NextFunction): void {
  const result = createBalanceSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_BALANCE_PAYLOAD",
      message: "Datos del balance inválidos",
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

export function validateUpdateBalance(req: Request, res: Response, next: NextFunction): void {
  const result = updateBalanceSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_BALANCE_PAYLOAD",
      message: "Datos del balance inválidos",
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

export function validateBalanceId(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id ?? "");

  if (!id || !uuidRegex.test(id)) {
    res.status(400).json({
      error: "INVALID_BALANCE_ID",
      message: "El id del balance no es válido",
    });
    return;
  }

  next();
}

export function validateWalletCurrencyParams(req: Request, res: Response, next: NextFunction): void {
  const walletId = String(req.params.walletId ?? "");
  const currencyCode = String(req.params.currencyCode ?? "");

  if (!walletId || !uuidRegex.test(walletId) || !currencyCode || currencyCode.trim().length < 3) {
    res.status(400).json({
      error: "INVALID_BALANCE_PARAMS",
      message: "Los parámetros walletId o currencyCode no son válidos",
    });
    return;
  }

  next();
}
