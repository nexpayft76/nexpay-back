import { Router } from "express";

import {
  feesSummary,
  getFeeSettings,
  listFees,
  listOffers,
  listTransactions,
  listUsers,
  setRole,
  setStatus,
  updateFeeSettings,
} from "./superuser.controller";
import { validateFees, validateRole, validateStatus, validateUserIdParam } from "./superuser.middlewares";

/** Todo lo de aquí exige sesión y rol de superusuario (se monta con requireAuth + requireSuperuser en app.ts). */
export const superuserRouter = Router();

/**
 * @openapi
 * /api/superuser/users:
 *   get:
 *     summary: Usuarios registrados (solo superusuario)
 *     tags: [Superuser]
 *     parameters:
 *       - { in: query, name: email, schema: { type: string }, description: "Búsqueda parcial por correo" }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 *       403: { description: No es superusuario }
 */
superuserRouter.get("/users", listUsers);

/**
 * @openapi
 * /api/superuser/users/{id}/role:
 *   patch:
 *     summary: Asignar rol (user o superuser)
 *     description: La cuenta propietaria siempre es superusuario; nadie puede cambiar su propio rol.
 *     tags: [Superuser]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { role: { type: string, enum: [user, superuser] } } } } }
 *     responses:
 *       200: { description: Usuario actualizado }
 *       409: { description: "Cuenta propietaria (OWNER_PROTECTED) o la propia (CANNOT_CHANGE_SELF)" }
 */
superuserRouter.patch("/users/:id/role", validateUserIdParam, validateRole, setRole);

/**
 * @openapi
 * /api/superuser/users/{id}/status:
 *   patch:
 *     summary: Suspender o reactivar una cuenta
 *     description: Al suspender, todas sus sesiones abiertas dejan de valer. La cuenta propietaria no se puede suspender.
 *     tags: [Superuser]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { status: { type: string, enum: [active, suspended] } } } } }
 *     responses:
 *       200: { description: Usuario actualizado }
 *       409: { description: "Cuenta propietaria (OWNER_PROTECTED) o la propia (CANNOT_CHANGE_SELF)" }
 */
superuserRouter.patch("/users/:id/status", validateUserIdParam, validateStatus, setStatus);

/**
 * @openapi
 * /api/superuser/fees/summary:
 *   get:
 *     summary: Comisiones cobradas por moneda (compras/ventas y P2P) y saldo de la billetera propietaria
 *     tags: [Superuser]
 *     responses:
 *       200: { description: "{ totals, owner_balances, owner_exists }" }
 * /api/superuser/fees:
 *   get:
 *     summary: Detalle de las comisiones cobradas
 *     tags: [Superuser]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 */
superuserRouter.get("/fees/summary", feesSummary);

/**
 * @openapi
 * /api/superuser/settings/fees:
 *   get:
 *     summary: Comisiones vigentes (intercambio de balance y P2P)
 *     tags: [Superuser]
 *     responses:
 *       200: { description: "{ exchange_fee_percent, p2p_fee_percent, updated_at, updated_by_email }" }
 *   patch:
 *     summary: Cambiar las comisiones (0 a 10 %, hasta 4 decimales)
 *     description: Rigen desde la próxima operación. Las ofertas P2P ya publicadas conservan la comisión con la que se publicaron.
 *     tags: [Superuser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exchange_fee_percent: { type: number, example: 0.05 }
 *               p2p_fee_percent: { type: number, example: 0.5 }
 *     responses:
 *       200: { description: Comisiones actualizadas }
 *       400: { description: Valor fuera de rango (INVALID_FEES) }
 */
superuserRouter.get("/settings/fees", getFeeSettings);
superuserRouter.patch("/settings/fees", validateFees, updateFeeSettings);
superuserRouter.get("/fees", listFees);

/**
 * @openapi
 * /api/superuser/transactions:
 *   get:
 *     summary: Todas las transacciones del sistema
 *     tags: [Superuser]
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [DEPOSIT, EXCHANGE, P2P] }, description: "EXCHANGE = intercambio de balance" }
 *       - { in: query, name: email, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /api/superuser/p2p/offers:
 *   get:
 *     summary: Todas las ofertas P2P del sistema
 *     tags: [Superuser]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [open, completed, cancelled, expired] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 */
superuserRouter.get("/transactions", listTransactions);
superuserRouter.get("/p2p/offers", listOffers);
