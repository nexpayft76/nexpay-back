import { z } from "zod";
import { walletQuerySchema } from "../schemas/rates.schema";
import { RatesSourceSchema } from "./rates.docs";
import { bearerAuth, errorResponse, jsonResponse, registry } from "./registry";

const BalanceSchema = z
  .object({
    currency: z.string().meta({ example: "COP" }),
    name: z.string().meta({ example: "Peso colombiano" }),
    decimals: z.number().int().meta({ example: 2 }),
    amount: z.string().meta({ description: "Saldo exacto (NUMERIC como texto)", example: "150000.00000000" }),
    valueInTarget: z
      .number()
      .nullable()
      .meta({ description: "Equivalente aproximado en la moneda de valorización", example: 45.83 }),
    updatedAt: z.string().meta({ example: "2026-09-24T21:00:00.000Z" }),
  })
  .meta({ id: "Balance" });

const WalletSchema = z
  .object({
    walletId: z.uuid(),
    createdAt: z.string().meta({ example: "2026-09-24T21:00:00.000Z" }),
    balances: z.array(BalanceSchema),
    valuation: z
      .object({
        currency: z.string().meta({ example: "USD" }),
        total: z.number().meta({ example: 145.83 }),
        ratesDate: z.string().meta({ example: "2026-09-24" }),
        ratesSource: RatesSourceSchema,
      })
      .nullable()
      .meta({ description: "null si las tasas no están disponibles; los saldos se muestran igual" }),
  })
  .meta({ id: "Wallet" });

registry.registerPath({
  method: "get",
  path: "/wallet",
  tags: ["Wallet"],
  summary: "Mi wallet y saldos",
  description: "Devuelve un saldo por moneda y el total de la wallet valorizado en `valuedIn` con las tasas actuales.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: walletQuerySchema },
  responses: {
    200: jsonResponse("Wallet con saldos", WalletSchema),
    400: errorResponse("Moneda de valorización inválida o no soportada"),
    401: errorResponse("Token ausente, inválido, expirado o revocado (UNAUTHORIZED)"),
    404: errorResponse("El usuario no tiene wallet (WALLET_NOT_FOUND)"),
  },
});
