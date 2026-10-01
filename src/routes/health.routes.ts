import { Router } from "express";
import { getHealth } from "../controllers/health.controller";

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifica la salud del backend y la conexión a la base
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API funcionando correctamente
 *       503:
 *         description: Base de datos no disponible
 */
healthRouter.get("/", getHealth);
