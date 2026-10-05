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

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: Listar mis notificaciones
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Notificaciones del usuario autenticado, de la más nueva a la más antigua
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       user_id: { type: string, format: uuid }
 *                       type: { type: string, enum: [rate_alert, system] }
 *                       title: { type: string }
 *                       message: { type: string }
 *                       read: { type: boolean }
 *                       created_at: { type: string, format: date-time }
 *                       alert_id: { type: string, format: uuid, nullable: true }
 */
notificationsRouter.get("/", async (req, res) => {
  const notifications = await notificationsRepository.listByUser(req.auth!.userId);
  res.status(200).json({ data: notifications });
});

/**
 * @openapi
 * /api/notifications:
 *   post:
 *     summary: Crear una notificación para mi cuenta
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title, message]
 *             properties:
 *               type: { type: string, enum: [rate_alert, system] }
 *               title: { type: string, minLength: 1, maxLength: 200 }
 *               message: { type: string, minLength: 1, maxLength: 2000 }
 *               read: { type: boolean, default: false }
 *               alert_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       201: { description: Notificación creada }
 *       400:
 *         description: Datos inválidos (INVALID_NOTIFICATION)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
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

/**
 * @openapi
 * /api/notifications/{id}:
 *   patch:
 *     summary: Marcar una notificación como leída o no leída
 *     tags: [Notifications]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [read]
 *             properties:
 *               read: { type: boolean }
 *     responses:
 *       200: { description: Notificación actualizada }
 *       400:
 *         description: Estado de lectura inválido (INVALID_NOTIFICATION_UPDATE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       404: { description: Notificación no encontrada }
 */
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

/**
 * @openapi
 * /api/notifications/{id}:
 *   delete:
 *     summary: Eliminar una notificación
 *     tags: [Notifications]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Notificación eliminada }
 *       404: { description: Notificación no encontrada }
 */
notificationsRouter.delete("/:id", async (req, res) => {
  const deleted = await notificationsRepository.delete(req.auth!.userId, String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "NOTIFICATION_NOT_FOUND", message: "La notificación no existe" });
    return;
  }

  res.status(204).send();
});
