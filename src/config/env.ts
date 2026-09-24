import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DB_SSL: z.enum(["true", "false"]).optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  FRONTEND_URL: z.string().min(1, "FRONTEND_URL es obligatoria"),
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

export const env = {
  ...data,
  isProduction: data.NODE_ENV === "production",
  // SSL explícito si se define DB_SSL; si no, activo solo en producción.
  dbSsl: data.DB_SSL ? data.DB_SSL === "true" : data.NODE_ENV === "production",
  // Permite varios orígenes separados por coma (ej. dominio de Vercel + localhost).
  corsOrigins: data.FRONTEND_URL.split(",").map((origin) => origin.trim().replace(/\/$/, "")),
};
