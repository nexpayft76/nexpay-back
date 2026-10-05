import { pool } from "../../config/db";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/** Comisiones que el superusuario cambia desde su panel. */
export interface FeeSettings {
  /** Intercambio de balance: % del monto de origen (0.05 = 0,05%). */
  exchange_fee_percent: number;
  /** P2P: % de lo que recibe cada parte. */
  p2p_fee_percent: number;
}

export type FeeSettingKey = keyof FeeSettings;

export interface FeeSettingsView extends FeeSettings {
  updated_at: string | null;
  updated_by_email: string | null;
}

/** Cuánto se guarda en memoria: la comisión se lee en cada operación y casi nunca cambia. */
const CACHE_MS = 30_000;
let cache: { value: FeeSettings; expires: number } | null = null;

function defaults(): FeeSettings {
  return { exchange_fee_percent: env.EXCHANGE_FEE_PERCENT, p2p_fee_percent: env.P2P_FEE_PERCENT };
}

async function load(): Promise<FeeSettingsView> {
  const { rows } = await pool.query<{ key: FeeSettingKey; value: string; updated_at: Date; email: string | null }>(
    `SELECT s.key, s.value::text AS value, s.updated_at, u.email
     FROM platform_settings s LEFT JOIN users u ON u.id = s.updated_by`,
  );
  const settings: FeeSettingsView = { ...defaults(), updated_at: null, updated_by_email: null };
  for (const row of rows) {
    settings[row.key] = Number(row.value);
    if (!settings.updated_at || row.updated_at.toISOString() > settings.updated_at) {
      settings.updated_at = row.updated_at.toISOString();
      settings.updated_by_email = row.email;
    }
  }
  return settings;
}

export const settingsService = {
  /**
   * Comisiones vigentes (con caché corta). Si la base no responde, usa las variables de entorno
   * para no frenar las operaciones.
   */
  async getFees(): Promise<FeeSettings> {
    if (cache && cache.expires > Date.now()) return cache.value;
    try {
      const { exchange_fee_percent, p2p_fee_percent } = await load();
      cache = { value: { exchange_fee_percent, p2p_fee_percent }, expires: Date.now() + CACHE_MS };
      return cache.value;
    } catch (error) {
      logger.warn("No se pudo leer la configuración de comisiones; se usan las variables de entorno", { error: String(error) });
      return defaults();
    }
  },

  /** Para el panel del superusuario: valores vigentes y quién los cambió por última vez. */
  getFeesView: (): Promise<FeeSettingsView> => load(),

  /** Guarda las comisiones que cambió el superusuario y limpia la caché (rige desde la próxima operación). */
  async updateFees(userId: string, changes: Partial<FeeSettings>): Promise<FeeSettingsView> {
    for (const [key, value] of Object.entries(changes) as [FeeSettingKey, number][]) {
      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, value, userId],
      );
    }
    cache = null;
    return load();
  },

  /** Solo para tests. */
  clearCache(): void {
    cache = null;
  },
};
