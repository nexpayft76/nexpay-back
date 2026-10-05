import type { Request, Response } from "express";

import { getAuth } from "../auth/auth.middlewares";
import {
  parseFeesQuery,
  parseOffersQuery,
  parseTransactionsQuery,
  parseUsersQuery,
  type RoleBody,
  type StatusBody,
} from "./superuser.middlewares";
import { superuserService } from "./superuser.service";

/** Usuarios registrados, con búsqueda por correo. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await superuserService.listUsers(parseUsersQuery(req.query)) });
}

/** Asigna el rol (usuario o superusuario). */
export async function setRole(req: Request, res: Response): Promise<void> {
  const { role } = req.body as RoleBody;
  res.status(200).json({ data: await superuserService.setRole(getAuth(req).userId, String(req.params.id), role) });
}

/** Suspende o reactiva una cuenta. */
export async function setStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as StatusBody;
  res.status(200).json({ data: await superuserService.setStatus(getAuth(req).userId, String(req.params.id), status) });
}

/** Comisiones cobradas por moneda y el saldo de la billetera propietaria. */
export async function feesSummary(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await superuserService.feesSummary() });
}

/** Detalle de las comisiones cobradas, de la más nueva a la más vieja. */
export async function listFees(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await superuserService.listFees(parseFeesQuery(req.query)) });
}

/** Todas las transacciones del sistema. */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await superuserService.listTransactions(parseTransactionsQuery(req.query)) });
}

/** Todas las ofertas P2P del sistema (abiertas, completadas, canceladas y vencidas). */
export async function listOffers(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await superuserService.listOffers(parseOffersQuery(req.query)) });
}
