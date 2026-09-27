import type { NextFunction, Request, Response } from "express";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

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
