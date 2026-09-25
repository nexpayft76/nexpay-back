/** De dónde salió el dato: recién pedido, de la caché vigente, o de la caché vencida porque la API falló. */
export type CacheSource = "live" | "cache" | "fallback";

export interface CachedResult<T> {
  value: T;
  source: CacheSource;
  fetchedAt: number;
}

export interface CachedSource<T> {
  get(key: string, fetcher: () => Promise<T>): Promise<CachedResult<T>>;
  clear(): void;
}

/**
 * Caché en memoria con TTL y fallback para una API externa:
 * 1. Si hay un valor vigente para `key`, lo devuelve sin llamar a la API.
 * 2. Si venció, llama a la API (una sola petición aunque lleguen varias a la vez).
 * 3. Si la API falla, devuelve el último valor guardado aunque esté vencido.
 * 4. Si no hay nada guardado, relanza el error.
 * `key` identifica qué se pidió (ej. la lista de monedas): si cambia, la caché no sirve.
 */
export function createCachedSource<T>(label: string, ttlMs: number): CachedSource<T> {
  let cache: { value: T; fetchedAt: number; key: string } | null = null;
  let inFlight: { key: string; promise: Promise<T> } | null = null;

  return {
    async get(key, fetcher) {
      const now = Date.now();
      if (cache && cache.key === key && now - cache.fetchedAt < ttlMs) {
        return { value: cache.value, source: "cache", fetchedAt: cache.fetchedAt };
      }

      try {
        if (!inFlight || inFlight.key !== key) {
          const promise = fetcher().finally(() => {
            if (inFlight?.promise === promise) inFlight = null;
          });
          inFlight = { key, promise };
        }
        const value = await inFlight.promise;
        cache = { value, fetchedAt: Date.now(), key };
        return { value, source: "live", fetchedAt: cache.fetchedAt };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (cache && cache.key === key) {
          console.warn(`${label} no disponible (${reason}); usando el último valor guardado`);
          return { value: cache.value, source: "fallback", fetchedAt: cache.fetchedAt };
        }
        console.error(`${label} no disponible y sin caché: ${reason}`);
        throw err;
      }
    },
    clear() {
      cache = null;
      inFlight = null;
    },
  };
}
