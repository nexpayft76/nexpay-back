import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const createWalletSchema = z.object({
  user_id: z.string().trim().regex(uuidRegex, "El id del usuario no es válido"),
});

export function validateCreateWallet(req: Request, res: Response, next: NextFunction): void {
  const result = createWalletSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "INVALID_WALLET_PAYLOAD",
      message: "Datos de la wallet inválidos",
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
