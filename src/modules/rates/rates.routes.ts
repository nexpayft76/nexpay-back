import { Router } from "express";

import { convert, getArsRates, getHistory, getRates } from "./rates.controller";

export const ratesRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     RatesSource:
 *       type: string
 *       enum: [live, cache, fallback]
 *       description: "live = recién pedidas al proveedor · cache = caché vigente · fallback = el proveedor falló y se usa la última tasa válida"
 *     RateWarnings:
 *       type: array
 *       description: "Avisos para mostrar al usuario. Vacío si todo está al día."
 *       items: { type: string }
 *       example: ["DolarApi (ARS) no está disponible por un problema de conexión; se usa la última tasa válida, obtenida el 26/9/26, 3:56 p. m."]
 *     ArsRateType:
 *       type: string
 *       enum: [oficial, mep, blue]
 *       description: "Tipo de dólar para ARS. Por defecto: mep. El blue es mercado informal (solo referencia)."
 */

/**
 * @openapi
 * /api/rates:
 *   get:
 *     summary: Tasas de cambio actuales entre las monedas activas
 *     description: |
 *       Tasas desde la moneda `base` hacia las demás monedas activas. Fuentes:
 *       - **Frankfurter v2** (USD, EUR, COP): tasa oficial diaria, caché de 1 h.
 *       - **DolarApi** (ARS): esta tabla usa el dólar MEP (promedio compra/venta), caché de 5 min.
 *
 *       Si un proveedor falla, se usa su **última tasa válida** (guardada en la base de datos)
 *       y se explica en `warnings`. Solo si nunca hubo una tasa, la moneda aparece en `unavailable`.
 *     tags: [Rates]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: base
 *         schema: { type: string, default: USD, example: COP }
 *         description: Moneda base (código de 3 letras)
 *     responses:
 *       200:
 *         description: Tasas de cambio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     base: { type: string, example: USD }
 *                     date: { type: string, example: "2026-09-26" }
 *                     source: { $ref: "#/components/schemas/RatesSource" }
 *                     fetched_at: { type: string, format: date-time }
 *                     rates:
 *                       type: object
 *                       additionalProperties: { type: number }
 *                       example: { COP: 3273.3, EUR: 0.87695, ARS: 1550.8 }
 *                     unavailable: { type: array, items: { type: string }, example: [] }
 *                     warnings: { $ref: "#/components/schemas/RateWarnings" }
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           provider: { type: string, enum: [frankfurter, dolarapi] }
 *                           label: { type: string }
 *                           currencies: { type: array, items: { type: string }, example: [ARS] }
 *                           source: { $ref: "#/components/schemas/RatesSource" }
 *                           stale: { type: boolean, description: "true si se usa la última tasa válida" }
 *                           fetched_at: { type: string, format: date-time }
 *                           published_at: { type: string, example: "2026-09-26T20:56:00.000Z" }
 *       400:
 *         description: Moneda inválida o no soportada (INVALID_RATES_QUERY / UNSUPPORTED_CURRENCY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: Nunca hubo una tasa válida para ninguna moneda (RATES_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
ratesRouter.get("/", getRates);

/**
 * @openapi
 * /api/rates/ars:
 *   get:
 *     summary: Cotizaciones del peso argentino por tipo de dólar
 *     description: "Oficial, MEP y blue con precio de compra y venta, para que el usuario elija cuál usar."
 *     tags: [Rates]
 *     security: []
 *     responses:
 *       200:
 *         description: Cotizaciones de ARS
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     default_type: { $ref: "#/components/schemas/ArsRateType" }
 *                     source: { $ref: "#/components/schemas/RatesSource" }
 *                     stale: { type: boolean }
 *                     fetched_at: { type: string, format: date-time }
 *                     warnings: { $ref: "#/components/schemas/RateWarnings" }
 *                     types:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type: { $ref: "#/components/schemas/ArsRateType" }
 *                           label: { type: string, example: "MEP (bolsa)" }
 *                           note: { type: string, example: "Mercado legal, varía durante el día" }
 *                           is_default: { type: boolean }
 *                           compra: { type: number, example: 1544.3 }
 *                           venta: { type: number, example: 1557.3 }
 *                           spread: { type: number, example: 13 }
 *                           published_at: { type: string, example: "2026-09-26T20:56:00.000Z" }
 *       503:
 *         description: Nunca hubo una cotización de ARS (RATES_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
ratesRouter.get("/ars", getArsRates);

/**
 * @openapi
 * /api/rates/convert:
 *   get:
 *     summary: Cotiza una conversión (no modifica saldos)
 *     description: |
 *       Ejemplo del corredor: cuántos pesos argentinos recibo por 1.000.000 COP.
 *
 *       Con ARS se usa el tipo de dólar `ars_rate` (por defecto MEP) y el precio según la dirección:
 *       si **recibes** ARS se usa el precio de **compra**; si **pagas** con ARS, el de **venta**.
 *     tags: [Rates]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, example: COP }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, example: ARS }
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: number, example: 1000000 }
 *       - in: query
 *         name: ars_rate
 *         schema: { $ref: "#/components/schemas/ArsRateType" }
 *     responses:
 *       200:
 *         description: Cotización
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     from: { type: string, example: COP }
 *                     to: { type: string, example: ARS }
 *                     amount: { type: number, example: 1000000 }
 *                     rate: { type: number, example: 0.4717869 }
 *                     result: { type: number, description: "Redondeado a los decimales de la moneda destino", example: 471786.88 }
 *                     ars_rate:
 *                       nullable: true
 *                       type: object
 *                       description: "Solo si participa ARS: tipo de dólar y precio usado"
 *                       properties:
 *                         type: { $ref: "#/components/schemas/ArsRateType" }
 *                         label: { type: string, example: "MEP (bolsa)" }
 *                         price_used: { type: string, enum: [compra, venta] }
 *                         compra: { type: number, example: 1544.3 }
 *                         venta: { type: number, example: 1557.3 }
 *                         published_at: { type: string }
 *                     date: { type: string, example: "2026-09-26" }
 *                     source: { $ref: "#/components/schemas/RatesSource" }
 *                     warnings: { $ref: "#/components/schemas/RateWarnings" }
 *       400:
 *         description: Parámetros inválidos o moneda no soportada
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: Nunca hubo una tasa válida para alguna de las monedas (RATES_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
ratesRouter.get("/convert", convert);

/**
 * @openapi
 * /api/rates/history:
 *   get:
 *     summary: Historial de una moneda contra USD, para gráficos
 *     description: |
 *       Serie diaria de "1 USD = X {moneda}" en el rango pedido, contado hacia atrás desde la
 *       **última tasa válida** (no desde hoy).
 *       - **COP, EUR**: Frankfurter (días hábiles). **USD**: se grafica 1 USD en COP (el corredor).
 *       - **ARS**: ArgentinaDatos, tres series (oficial, MEP, blue), promedio compra/venta, todos los días.
 *
 *       Caché de 6 h. Si la fuente falla, se usa el último historial guardado y se avisa en `warnings`.
 *     tags: [Rates]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         required: true
 *         schema: { type: string, example: ARS }
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [1w, 1m, 3m, 6m, 1y], default: 1m }
 *     responses:
 *       200:
 *         description: Series históricas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     currency: { type: string, example: ARS }
 *                     base: { type: string, example: USD }
 *                     quote: { type: string, example: ARS }
 *                     range: { type: string, example: 1m }
 *                     from: { type: string, example: "2026-08-27" }
 *                     to: { type: string, example: "2026-09-26" }
 *                     provider: { type: string, enum: [frankfurter, argentinadatos] }
 *                     source: { $ref: "#/components/schemas/RatesSource" }
 *                     stale: { type: boolean }
 *                     fetched_at: { type: string, format: date-time }
 *                     warnings: { $ref: "#/components/schemas/RateWarnings" }
 *                     series:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: mep }
 *                           label: { type: string, example: "Dólar MEP (bolsa)" }
 *                           points:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 date: { type: string, example: "2026-09-26" }
 *                                 value: { type: number, example: 1550.8 }
 *                           stats:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               first: { type: number }
 *                               last: { type: number }
 *                               change_pct: { type: number, example: 2.35 }
 *                               min: { type: number }
 *                               max: { type: number }
 *       400:
 *         description: Moneda o rango inválidos (INVALID_HISTORY_QUERY / UNSUPPORTED_CURRENCY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: La fuente falló y nunca hubo un historial guardado (HISTORY_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
ratesRouter.get("/history", getHistory);
