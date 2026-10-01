import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DB_SSL: z.enum(["true", "false"]).optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_EXPIRES_IN debe tener el formato <número><s|m|h|d>, ej. 1h")
    .default("1h"),
  FRONTEND_URL: z.string().min(1, "FRONTEND_URL es obligatoria"),
  // Tasas oficiales diarias (USD, EUR, COP). Se usa la v2 porque la v1 no incluye COP.
  FRANKFURTER_BASE_URL: z.url().default("https://api.frankfurter.dev/v2"),
  RATES_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  // Peso argentino: dólar MEP desde DolarApi. Cambia durante el día, por eso su caché es más corta.
  DOLARAPI_BASE_URL: z.url().default("https://dolarapi.com/v1"),
  ARS_RATES_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // Historial para gráficos: ARS desde ArgentinaDatos (mismo autor que DolarApi). Cambia poco: caché de 6 h.
  ARGENTINADATOS_BASE_URL: z.url().default("https://api.argentinadatos.com/v1"),
  HISTORY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
  // Recargas con dinero ficticio (modo demo). Poner en "false" si algún día se maneja dinero real.
  DEMO_DEPOSITS_ENABLED: z.enum(["true", "false"]).default("true"),
  // Comisión por compra/venta/intercambio, en % del monto de origen (1 = 1%).
  // 0 para la Demo 1 (sin comisión); se activa en la demo final (ej. 1).
  EXCHANGE_FEE_PERCENT: z.coerce.number().min(0).max(10).default(0),
  // Emails (separados por coma) que pueden usar el CRUD de administración: listar usuarios, billeteras,
  // saldos y transacciones de todos, editar usuarios y el catálogo de monedas. Vacío = nadie.
  ADMIN_EMAILS: z.string().default(""),
  // AWS SES para envío de notificaciones por email
  AWS_REGION: z.string().default("us-east-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().email().default("nexpay.team@gmail.com"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Convierte "15m", "1h", "7d"... a segundos. El formato ya fue validado por zod. */
function durationToSeconds(value: string): number {
  const unit = value.slice(-1) as keyof typeof SECONDS_PER_UNIT;
  return Number(value.slice(0, -1)) * SECONDS_PER_UNIT[unit];
}

export const env = {
  ...data,
  jwtExpiresInSeconds: durationToSeconds(data.JWT_EXPIRES_IN),
  isProduction: data.NODE_ENV === "production",
  demoDepositsEnabled: data.DEMO_DEPOSITS_ENABLED === "true",
  adminEmails: new Set(
    data.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
  // SSL explícito si se define DB_SSL; si no, activo solo en producción.
  dbSsl: data.DB_SSL ? data.DB_SSL === "true" : data.NODE_ENV === "production",
  // Varios orígenes separados por coma; admite "*" para previews (ver src/config/cors.ts).
  corsOrigins: data.FRONTEND_URL.split(",").map((origin) => origin.trim().replace(/\/$/, "")),
  // Configuración de AWS SES para emails
  aws: {
    region: data.AWS_REGION,
    accessKeyId: data.AWS_ACCESS_KEY_ID,
    secretAccessKey: data.AWS_SECRET_ACCESS_KEY,
    fromEmail: data.SES_FROM_EMAIL,
    isConfigured: Boolean(data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY && data.SES_FROM_EMAIL),
  },
};
