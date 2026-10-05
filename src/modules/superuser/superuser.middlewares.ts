import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../utils/app-error";
import { pageSchema } from "../transactions/transactions.middlewares";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

function parse<T extends z.ZodType>(schema: T, value: unknown, code: string, message: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      400,
      code,
      message,
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

/** Texto de búsqueda por correo (parcial): "ana" encuentra "ana@nexpay.com". */
const emailSearch = z.string().trim().min(1).max(254).optional();

const usersQuerySchema = pageSchema.extend({ email: emailSearch }).strict();
const transactionsQuerySchema = pageSchema
  .extend({
    email: emailSearch,
    // EXCHANGE = intercambio de balance (agrupa compra, venta e intercambio).
    type: z.enum(["DEPOSIT", "EXCHANGE", "P2P"], { error: "type debe ser DEPOSIT, EXCHANGE o P2P" }).optional(),
  })
  .strict();
const offersQuerySchema = pageSchema
  .extend({ status: z.enum(["open", "completed", "cancelled", "expired"], { error: "status no válido" }).optional() })
  .strict();
const feesQuerySchema = pageSchema.strict();

export const parseUsersQuery = (query: unknown) => parse(usersQuerySchema, query, "INVALID_QUERY", "Filtros inválidos");
export const parseTransactionsQuery = (query: unknown) =>
  parse(transactionsQuerySchema, query, "INVALID_QUERY", "Filtros inválidos");
export const parseOffersQuery = (query: unknown) => parse(offersQuerySchema, query, "INVALID_QUERY", "Filtros inválidos");
export const parseFeesQuery = (query: unknown) => parse(feesQuerySchema, query, "INVALID_QUERY", "Filtros inválidos");

/** Solo dos roles: usuario o superusuario. */
const roleSchema = z.object({ role: z.enum(["user", "superuser"], { error: "El rol debe ser user o superuser" }) }).strict();
/** Suspender o reactivar (cerrar una cuenta es otra cosa: la hace el propio usuario). */
const statusSchema = z
  .object({ status: z.enum(["active", "suspended"], { error: "El estado debe ser active o suspended" }) })
  .strict();

export type RoleBody = z.output<typeof roleSchema>;
export type StatusBody = z.output<typeof statusSchema>;

export function validateRole(req: Request, _res: Response, next: NextFunction): void {
  req.body = parse(roleSchema, req.body, "INVALID_ROLE", "Rol inválido");
  next();
}

export function validateStatus(req: Request, _res: Response, next: NextFunction): void {
  req.body = parse(statusSchema, req.body, "INVALID_STATUS", "Estado inválido");
  next();
}

export function validateUserIdParam(req: Request, _res: Response, next: NextFunction): void {
  if (!uuidRegex.test(String(req.params.id ?? ""))) {
    throw new AppError(400, "INVALID_USER_ID", "El id del usuario no es válido");
  }
  next();
}
