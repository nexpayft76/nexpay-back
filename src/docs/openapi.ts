import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";

// Cada archivo *.docs.ts registra sus endpoints al importarse.
import "./health.docs";
import "./auth.docs";
import "./wallet.docs";
import "./rates.docs";

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.3",
  info: {
    title: "NexPay API",
    version: "1.0.0",
    description:
      "API de NexPay: wallet multi-moneda (COP, USD, EUR).\n\n" +
      "**Cómo probar rutas protegidas:** haz login o registro, copia el `token` y pégalo en el botón **Authorize**.",
  },
  tags: [
    { name: "Health", description: "Estado del servicio" },
    { name: "Auth", description: "Registro, login, logout y usuario actual" },
    { name: "Wallet", description: "Saldos del usuario autenticado" },
    { name: "Rates", description: "Tasas de cambio (Frankfurter) con caché y fallback" },
  ],
});
