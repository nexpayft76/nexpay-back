import { Router } from "express";

import { createCurrency, deleteCurrency, getCurrency, listCurrencies, updateCurrency } from "./currencies.controller";
import { validateCreateCurrency, validateCurrencyCode, validateUpdateCurrency } from "./currencies.middlewares";

export const currenciesRouter = Router();

/**
 * @openapi
 * /api/currencies:
 *   get:
 *     summary: Listar monedas activas
 *     tags: [Currencies]
 *     responses:
 *       200:
 *         description: Lista de monedas
 */
currenciesRouter.get("/", listCurrencies);

/**
 * @openapi
 * /api/currencies:
 *   post:
 *     summary: Crear moneda
 *     tags: [Currencies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, decimals]
 *             properties:
 *               code:
 *                 type: string
 *                 example: USD
 *               name:
 *                 type: string
 *                 example: Dólar estadounidense
 *               decimals:
 *                 type: integer
 *                 example: 2
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Moneda creada
 */
currenciesRouter.post("/", validateCreateCurrency, createCurrency);

/**
 * @openapi
 * /api/currencies/{code}:
 *   get:
 *     summary: Obtener moneda por código
 *     tags: [Currencies]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         example: USD
 *     responses:
 *       200:
 *         description: Moneda encontrada
 *       404:
 *         description: Moneda no encontrada
 *   patch:
 *     summary: Actualizar moneda
 *     tags: [Currencies]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         example: USD
 *     responses:
 *       200:
 *         description: Moneda actualizada
 *   delete:
 *     summary: Desactivar moneda
 *     tags: [Currencies]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         example: USD
 *     responses:
 *       204:
 *         description: Moneda desactivada
 */
currenciesRouter.get("/:code", validateCurrencyCode, getCurrency);
currenciesRouter.patch("/:code", validateCurrencyCode, validateUpdateCurrency, updateCurrency);
currenciesRouter.delete("/:code", validateCurrencyCode, deleteCurrency);
