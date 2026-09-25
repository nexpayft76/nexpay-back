import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const currencyCodeRegex = /^[A-Z0-9]{3,10}$/;

const createCurrencySchema = z.object({
  code: z.string().trim().min(3, "El código de moneda es obligatorio").max(10, "El código es demasiado largo").regex(currencyCodeRegex, "El código debe tener 3 a 10 caracteres alfanuméricos y estar en mayúsculas").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "El nombre de la moneda es obligatorio").max(80, "El nombre es demasiado largo"),
  decimals: z.number().int().min(0, "Los decimales no pueden ser negativos").max(18, "Los decimales no pueden exceder 18"),
  is_active: z.boolean().optional(),
});

const updateCurrencySchema = z.object({
  name: z.string().trim().min(2, "El nombre de la moneda es obligatorio").max(80, "El nombre es demasiado largo").optional(),
  decimals: z.number().int().min(0, "Los decimales no pueden ser negativos").max(18, "Los decimales no pueden exceder 18").optional(),
  is_active: z.boolean().optional(),
});

export function validateCreateCurrency(req: Request, res: Response, next: NextFunction): void {
  const result = createCurrencySchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_CURRENCY_PAYLOAD",
      message: "Datos de la moneda inválidos",
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

export function validateUpdateCurrency(req: Request, res: Response, next: NextFunction): void {
  const result = updateCurrencySchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_CURRENCY_PAYLOAD",
      message: "Datos de la moneda inválidos",
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

export function validateCurrencyCode(req: Request, res: Response, next: NextFunction): void {
  const code = String(req.params.code ?? "");

  if (!code || !currencyCodeRegex.test(code.toUpperCase())) {
    res.status(400).json({
      error: "INVALID_CURRENCY_CODE",
      message: "El código de la moneda no es válido",
    });
    return;
  }

  req.params.code = code.toUpperCase();
  next();
}
