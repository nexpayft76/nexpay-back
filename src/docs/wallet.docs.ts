import { z } from "zod";
import { walletQuerySchema } from "../schemas/rates.schema";
import { depositSchema } from "../schemas/wallet.schema";
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

const DepositResultSchema = z
  .object({
    transactionId: z.uuid(),
    type: z.literal("DEPOSIT"),
    currency: z.string().meta({ example: "USD" }),
    amount: z.string().meta({ example: "500.00" }),
    newBalance: z.string().meta({ description: "Saldo después de la recarga", example: "500.00000000" }),
    createdAt: z.string().meta({ example: "2026-09-25T15:00:00.000Z" }),
  })
  .meta({ id: "DepositResult" });

registry.registerPath({
  method: "post",
  path: "/wallet/deposits",
  tags: ["Wallet"],
  summary: "Recargar dinero ficticio (modo demo)",
  description:
    "Suma el monto al saldo y registra un DEPOSIT en el historial, todo en una transacción SQL. " +
    "Máximo por recarga: 10.000 USD, 10.000 EUR o 50.000.000 COP. Se desactiva con DEMO_DEPOSITS_ENABLED=false.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: depositSchema } }, required: true } },
  responses: {
    201: jsonResponse("Recarga aplicada", DepositResultSchema),
    400: errorResponse("Monto o moneda inválidos, más decimales de los permitidos o límite excedido"),
    401: errorResponse("Token ausente, inválido, expirado o revocado (UNAUTHORIZED)"),
    403: errorResponse("Recargas de prueba desactivadas (DEPOSITS_DISABLED)"),
  },
});
