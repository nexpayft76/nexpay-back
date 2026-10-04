import { Router } from "express";

import { rateLimit } from "../../middlewares/rate-limit.middleware";
import { getAuth } from "../auth/auth.middlewares";
import { acceptOffer, cancelOffer, createOffer, listMarket, listMine, quote } from "./p2p.controller";
import { validateOffer, validateOfferId } from "./p2p.middlewares";

export const p2pRouter = Router();

/** Operaciones que mueven dinero: máximo 10 por minuto por usuario. */
const moneyLimit = rateLimit({ windowMs: 60_000, max: 10, key: (req) => `p2p:${getAuth(req).userId}` });

/**
 * @openapi
 * components:
 *   schemas:
 *     P2POffer:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         status: { type: string, enum: [open, completed, cancelled, expired] }
 *         sell_currency: { type: string, example: USD }
 *         buy_currency: { type: string, example: COP }
 *         sell_amount: { type: string, description: "Lo que entrega el vendedor (retenido mientras está abierta)", example: "100.00" }
 *         rate: { type: number, description: "Tasa elegida por el vendedor: unidades de buy_currency por 1 de sell_currency", example: 4000 }
 *         market_rate: { type: number, description: "Tasa del mercado al publicar", example: 3900 }
 *         buy_amount: { type: string, description: "Lo que paga el comprador", example: "400000.00" }
 *         fee_percent: { type: number, description: "Comisión de cada parte, en % de lo que recibe", example: 0.5 }
 *         seller_fee: { type: string, example: "2000.00" }
 *         seller_receives: { type: string, example: "398000.00" }
 *         buyer_fee: { type: string, example: "0.50" }
 *         buyer_receives: { type: string, example: "99.50" }
 *         seller_name: { type: string, description: "Solo en el mercado: nombre e inicial del apellido", example: "Ana P." }
 *         created_at: { type: string, format: date-time }
 *         expires_at: { type: string, format: date-time }
 *         closed_at: { type: string, format: date-time, nullable: true }
 */

/**
 * @openapi
 * /api/p2p/quote:
 *   get:
 *     summary: Simular una oferta P2P (sin mover saldos)
 *     description: Devuelve la tasa actual del mercado, el rango permitido (±10%), la comisión y lo que recibiría cada parte.
 *     tags: [P2P]
 *     parameters:
 *       - { in: query, name: sell_currency, required: true, schema: { type: string, example: USD } }
 *       - { in: query, name: buy_currency, required: true, schema: { type: string, example: COP } }
 *       - { in: query, name: sell_amount, required: true, schema: { type: number, example: 100 } }
 *       - { in: query, name: rate, schema: { type: number, example: 4000 }, description: "Opcional: sin tasa se simula con la del mercado" }
 *     responses:
 *       200: { description: Simulación de la oferta }
 *       400: { description: "Datos inválidos o tasa fuera de rango (RATE_OUT_OF_RANGE)" }
 */
p2pRouter.get("/quote", quote);

/**
 * @openapi
 * /api/p2p/offers:
 *   get:
 *     summary: Mercado P2P (ofertas abiertas de otros usuarios)
 *     tags: [P2P]
 *     parameters:
 *       - { in: query, name: sell_currency, schema: { type: string, example: USD } }
 *       - { in: query, name: buy_currency, schema: { type: string, example: COP } }
 *     responses:
 *       200:
 *         description: Ofertas abiertas
 *         content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: "#/components/schemas/P2POffer" } } } } } }
 *   post:
 *     summary: Publicar una oferta P2P
 *     description: |
 *       El monto a vender sale del saldo y queda retenido en garantía hasta que alguien acepte,
 *       se cancele o venza (72 h). La tasa debe estar a ±10% de la del mercado.
 *     tags: [P2P]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sell_currency, buy_currency, sell_amount, rate]
 *             properties:
 *               sell_currency: { type: string, example: USD }
 *               buy_currency: { type: string, example: COP }
 *               sell_amount: { type: number, example: 100 }
 *               rate: { type: number, example: 4000 }
 *     responses:
 *       201: { description: Oferta publicada }
 *       409: { description: "Saldo insuficiente (INSUFFICIENT_BALANCE) o demasiadas ofertas abiertas (TOO_MANY_OFFERS)" }
 */
p2pRouter.get("/offers", listMarket);
p2pRouter.post("/offers", moneyLimit, validateOffer, createOffer);

/**
 * @openapi
 * /api/p2p/offers/me:
 *   get:
 *     summary: Mis ofertas P2P (abiertas y cerradas)
 *     tags: [P2P]
 *     responses:
 *       200: { description: Ofertas del usuario }
 */
p2pRouter.get("/offers/me", listMine);

/**
 * @openapi
 * /api/p2p/offers/{id}/accept:
 *   post:
 *     summary: Aceptar una oferta P2P
 *     description: |
 *       Intercambio instantáneo y atómico: se bloquean las dos cuentas mientras se ejecuta, el comprador
 *       paga buy_amount y cada parte recibe lo suyo con la comisión descontada. O pasa todo o no pasa nada.
 *     tags: [P2P]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Intercambio realizado }
 *       409: { description: "Ya no está disponible (OFFER_NOT_AVAILABLE), es propia (OWN_OFFER) o saldo insuficiente" }
 */
p2pRouter.post("/offers/:id/accept", moneyLimit, validateOfferId, acceptOffer);

/**
 * @openapi
 * /api/p2p/offers/{id}/cancel:
 *   post:
 *     summary: Cancelar una oferta P2P propia (devuelve lo retenido)
 *     tags: [P2P]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Oferta cancelada }
 *       409: { description: La oferta ya está cerrada }
 */
p2pRouter.post("/offers/:id/cancel", moneyLimit, validateOfferId, cancelOffer);
