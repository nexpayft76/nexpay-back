import type { Request, Response } from "express";
import { alertsService } from "./alerts.service";
import type { CreateAlertInput, UpdateAlertInput } from "./alerts.types";

export async function listAlerts(req: Request, res: Response): Promise<void> {
  const alerts = await alertsService.list(req.auth!.userId);
  res.status(200).json({ data: alerts });
}

export async function createAlert(req: Request, res: Response): Promise<void> {
  const alert = await alertsService.create(req.auth!.userId, req.body as CreateAlertInput);
  res.status(201).json({ data: alert });
}

export async function updateAlert(req: Request, res: Response): Promise<void> {
  const alert = await alertsService.update(req.auth!.userId, String(req.params.id), req.body as UpdateAlertInput);
  res.status(200).json({ data: alert });
}

export async function deleteAlert(req: Request, res: Response): Promise<void> {
  await alertsService.delete(req.auth!.userId, String(req.params.id));
  res.status(204).send();
}