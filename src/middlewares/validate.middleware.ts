import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { parseInput } from "../utils/validation";

/** Valida y normaliza `req.body` con un schema de zod. Si falla, responde 400. */
export function validateBody(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = parseInput(schema, req.body);
    next();
  };
}
