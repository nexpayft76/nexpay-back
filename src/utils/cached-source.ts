import { logger } from "./logger";

/** De dónde salió el dato: recién pedido, de la caché vigente, o el último válido porque la API falló. */
export type CacheSource = "live" | "cache" | "fallback";

export interface CachedResult<T> {
  value: T;
  source: CacheSource;
  fetchedAt: number;
}

/** Respaldo persistente opcional (ej. una tabla), para sobrevivir a reinicios del servidor. */
export interface PersistentStore<T> {
  load(key: string): Promise<{ value: T; fetchedAt: number } | null>;
  save(key: string, value: T, fetchedAt: number): Promise<void>;
}

export interface CachedSource<T> {
  get(key: string, fetcher: () => Promise<T>): Promise<CachedResult<T>>;
  clear(): void;
}

/** Mientras la API esté caída, se reintenta como máximo cada este tiempo (evita esperar timeouts en cada petición). */
const DEFAULT_RETRY_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  key: string;
  /** true = es un respaldo porque la API falló: se responde siempre como "fallback", nunca como vigente. */
  stale: boolean;
}

/**
 * Caché en memoria con TTL y fallback para una API externa:
 * 1. Si hay un valor vigente para `key`, lo devuelve sin llamar a la API.
 * 2. Si venció, llama a la API (una sola petición aunque lleguen varias a la vez) y lo guarda también en `store`.
 * 3. Si la API falla, devuelve el último valor en memoria; si no hay (ej. el servidor se reinició), el de `store`.
 *    Ese valor queda marcado como "stale": se sigue informando como fallback y la API se reintenta
 *    como máximo una vez cada `retryMs`, respondiendo al instante entre reintentos.
 * 4. Solo si no existe ningún valor válido previo, relanza el error.
 * `key` identifica qué se pidió (ej. la lista de monedas): si cambia, los valores guardados no sirven.
 */
export function createCachedSource<T>(
  label: string,
  ttlMs: number,
  store?: PersistentStore<T>,
  retryMs: number = DEFAULT_RETRY_MS,
): CachedSource<T> {
  let cache: CacheEntry<T> | null = null;
  let nextRetryAt = 0;
  let inFlight: { key: string; promise: Promise<T> } | null = null;

  const fallback = (entry: CacheEntry<T>): CachedResult<T> => ({
    value: entry.value,
    source: "fallback",
    fetchedAt: entry.fetchedAt,
  });

  return {
    async get(key, fetcher) {
      const now = Date.now();
      if (cache && cache.key === key) {
        if (!cache.stale && now - cache.fetchedAt < ttlMs) {
          return { value: cache.value, source: "cache", fetchedAt: cache.fetchedAt };
        }
        if (cache.stale && now < nextRetryAt) return fallback(cache);
      }

      try {
        if (!inFlight || inFlight.key !== key) {
          const promise = fetcher().finally(() => {
            if (inFlight?.promise === promise) inFlight = null;
          });
          inFlight = { key, promise };
        }
        const value = await inFlight.promise;
        cache = { value, fetchedAt: Date.now(), key, stale: false };
        // Guardar el respaldo no debe hacer fallar la respuesta.
        await store?.save(key, value, cache.fetchedAt).catch((err: unknown) => {
          logger.error(`${label}: no se pudo guardar el respaldo en la BD`, { error: err });
        });
        return { value, source: "live", fetchedAt: cache.fetchedAt };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        nextRetryAt = Date.now() + retryMs;

        if (cache && cache.key === key) {
          logger.warn(`${label} no disponible; usando el último valor en memoria`, { reason });
          cache.stale = true;
          return fallback(cache);
        }

        const saved = await store?.load(key).catch(() => null);
        if (saved) {
          logger.warn(`${label} no disponible; usando el último valor guardado en la BD`, { reason });
          cache = { value: saved.value, fetchedAt: saved.fetchedAt, key, stale: true };
          return fallback(cache);
        }

        logger.error(`${label} no disponible y sin ningún valor previo`, { reason });
        throw err;
      }
    },
    clear() {
      cache = null;
      inFlight = null;
      nextRetryAt = 0;
    },
  };
}
