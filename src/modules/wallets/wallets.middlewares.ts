import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../utils/app-error";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const myWalletQuerySchema = z.object({
  valued_in: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "valued_in debe ser un código de moneda de 3 letras, ej. USD")
    .default("USD"),
});

/** Valida `?valued_in=` (Express 5: req.query es de solo lectura, se devuelve ya normalizado). */
export function parseMyWalletQuery(query: unknown): z.output<typeof myWalletQuerySchema> {
  const result = myWalletQuerySchema.safeParse(query);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_WALLET_QUERY",
      "Parámetros de consulta inválidos",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

export function validateWalletId(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id ?? "");

  if (!id || !uuidRegex.test(id)) {
    res.status(400).json({
      error: "INVALID_WALLET_ID",
      message: "El id de la wallet no es válido",
    });
    return;
  }

  next();
}

export function validateUserId(req: Request, res: Response, next: NextFunction): void {
  const userId = String(req.params.userId ?? "");

  if (!userId || !uuidRegex.test(userId)) {
    res.status(400).json({
      error: "INVALID_USER_ID",
      message: "El id del usuario no es válido",
    });
    return;
  }

  next();
}

const depositSchema = z
  .object({
    currency: z
      .string({ error: "La moneda es obligatoria" })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "La moneda debe ser un código de 3 letras, ej. COP"),
    amount: z
      .number({ error: "El monto debe ser un número" })
      .positive("El monto debe ser mayor que 0"),
  })
  .strict();

/** Valida el body de POST /api/wallets/me/deposits. Si falla, responde 400 con el detalle por campo. */
export function validateDeposit(req: Request, res: Response, next: NextFunction): void {
  const result = depositSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "INVALID_DEPOSIT_PAYLOAD",
      message: "Datos de la recarga inválidos",
      details: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return;
  }
  req.body = result.data;
  next();
}
