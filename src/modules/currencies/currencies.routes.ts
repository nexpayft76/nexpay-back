import { Router } from "express";

import { createCurrency, deleteCurrency, getCurrency, listCurrencies, updateCurrency } from "./currencies.controller";

export const currenciesRouter = Router();

/**
 * @openapi
 * /api/currencies:
 *   get:
 *     summary: Listar monedas activas
 *     tags: [Currencies]
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
 *               name:
 *                 type: string
 *               decimals:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 */
currenciesRouter.get("/", listCurrencies);
currenciesRouter.post("/", createCurrency);

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
 *   patch:
 *     summary: Actualizar moneda
 *     tags: [Currencies]
 *   delete:
 *     summary: Desactivar moneda
 *     tags: [Currencies]
 */
currenciesRouter.get("/:code", getCurrency);
currenciesRouter.patch("/:code", updateCurrency);
currenciesRouter.delete("/:code", deleteCurrency);
