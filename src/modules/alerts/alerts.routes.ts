import { Router } from "express";
import { createAlert, deleteAlert, listAlerts, updateAlert } from "./alerts.controller";
import { validateAlertId, validateCreateAlert, validateUpdateAlert } from "./alerts.middlewares";

export const alertsRouter = Router();

/**
 * @openapi
 * /api/alerts:
 *   get:
 *     summary: Listar mis alertas
 *     tags: [Alerts]
 *     responses:
 *       200:
 *         description: Alertas del usuario autenticado
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
 *                       kind: { type: string, enum: [daily_change, target_rate, low_balance, stale_rates, deposit_received] }
 *                       currency: { type: string, example: USD }
 *                       base_currency: { type: string, example: COP }
 *                       direction: { type: string, enum: [up, down] }
 *                       threshold: { type: number }
 *                       enabled: { type: boolean }
 *                       email_enabled: { type: boolean }
 *                       created_at: { type: string, format: date-time }
 *                       updated_at: { type: string, format: date-time }
 */
alertsRouter.get("/", listAlerts);

/**
 * @openapi
 * /api/alerts:
 *   post:
 *     summary: Crear una alerta
 *     description: Las monedas deben estar activas. El umbral admite hasta 2 decimales.
 *     tags: [Alerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, currency, base_currency, direction, threshold, email_enabled]
 *             properties:
 *               kind: { type: string, enum: [daily_change, target_rate, low_balance, stale_rates, deposit_received] }
 *               currency: { type: string, example: USD }
 *               base_currency: { type: string, example: COP }
 *               direction: { type: string, enum: [up, down] }
 *               threshold: { type: number, minimum: 0, example: 4000 }
 *               email_enabled: { type: boolean }
 *     responses:
 *       201: { description: Alerta creada }
 *       400:
 *         description: Datos inválidos o moneda no soportada (INVALID_ALERT_PAYLOAD / UNSUPPORTED_CURRENCY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
alertsRouter.post("/", validateCreateAlert, createAlert);

/**
 * @openapi
 * /api/alerts/{id}:
 *   patch:
 *     summary: Actualizar una alerta
 *     description: Acepta uno o más campos de la alerta; las monedas deben estar activas.
 *     tags: [Alerts]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               kind: { type: string, enum: [daily_change, target_rate, low_balance, stale_rates, deposit_received] }
 *               currency: { type: string, example: USD }
 *               base_currency: { type: string, example: COP }
 *               direction: { type: string, enum: [up, down] }
 *               threshold: { type: number, minimum: 0, example: 4000 }
 *               email_enabled: { type: boolean }
 *               enabled: { type: boolean }
 *     responses:
 *       200: { description: Alerta actualizada }
 *       400:
 *         description: Datos inválidos, id inválido o moneda no soportada
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       404: { description: Alerta no encontrada }
 */
alertsRouter.patch("/:id", validateAlertId, validateUpdateAlert, updateAlert);

/**
 * @openapi
 * /api/alerts/{id}:
 *   delete:
 *     summary: Eliminar una alerta
 *     tags: [Alerts]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Alerta eliminada }
 *       400: { description: Id de alerta inválido }
 *       404: { description: Alerta no encontrada }
 */
alertsRouter.delete("/:id", validateAlertId, deleteAlert);