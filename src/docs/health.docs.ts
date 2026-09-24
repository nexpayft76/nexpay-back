import { z } from "zod";
import { jsonResponse, registry } from "./registry";

const HealthSchema = z
  .object({
    status: z.enum(["ok", "error"]).meta({ example: "ok" }),
    database: z.enum(["connected", "disconnected"]).meta({ example: "connected" }),
    currencies: z.number().int().optional().meta({ example: 3 }),
    timestamp: z.string().optional().meta({ example: "2026-09-24T20:47:56.897Z" }),
  })
  .meta({ id: "Health" });

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Estado del servidor y de la base de datos",
  description: "Consulta `SELECT COUNT(*) FROM currencies` para confirmar la conexión a PostgreSQL.",
  responses: {
    200: jsonResponse("Servidor y base de datos operativos", HealthSchema),
    503: jsonResponse("La base de datos no responde", HealthSchema),
  },
});
