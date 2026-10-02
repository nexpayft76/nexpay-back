import { Router } from "express";
import { z } from "zod";

import { notificationsRepository } from "./notifications.repository";

const notificationInputSchema = z
  .object({
    type: z.enum(["rate_alert", "system"]),
    title: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(2000),
    read: z.boolean().optional(),
    alert_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const notificationReadSchema = z
  .object({
    read: z.boolean(),
  })
  .strict();

export const notificationsRouter = Router();

notificationsRouter.get("/", async (req, res) => {
  const notifications = await notificationsRepository.listByUser(req.auth!.userId);
  res.status(200).json({ data: notifications });
});

notificationsRouter.post("/", async (req, res) => {
  const result = notificationInputSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "INVALID_NOTIFICATION",
      message: "La notificación es inválida",
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const notification = await notificationsRepository.create(req.auth!.userId, result.data);
  res.status(201).json({ data: notification });
});

notificationsRouter.patch("/:id", async (req, res) => {
  const result = notificationReadSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "INVALID_NOTIFICATION_UPDATE",
      message: "El estado de lectura es inválido",
    });
    return;
  }

  const notification = await notificationsRepository.updateRead(req.auth!.userId, String(req.params.id), result.data.read);
  if (!notification) {
    res.status(404).json({ error: "NOTIFICATION_NOT_FOUND", message: "La notificación no existe" });
    return;
  }

  res.status(200).json({ data: notification });
});

notificationsRouter.delete("/:id", async (req, res) => {
  const deleted = await notificationsRepository.delete(req.auth!.userId, String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "NOTIFICATION_NOT_FOUND", message: "La notificación no existe" });
    return;
  }

  res.status(204).send();
});
