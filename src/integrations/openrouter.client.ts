import { env } from "../config/env";
import { AppError } from "../utils/app-error";
import { logger } from "../utils/logger";

/** Tiempo máximo por modelo: si uno no responde, se pasa al siguiente. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Pausa de un modelo sin cupo (429) cuando OpenRouter no informa a qué hora se restablece. */
const COOLDOWN_RATE_LIMITED_MS = 5 * 60_000;
/** Pausa de un modelo que ya no existe o pide crédito (404/402). */
const COOLDOWN_UNAVAILABLE_MS = 60 * 60_000;
const MAX_COOLDOWN_MS = 24 * 60 * 60_000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  /** Modelo elegido por el usuario: se prueba primero; si no tiene cupo, se sigue con los demás. */
  preferredModel?: string;
}

export interface CompletionResult {
  reply: string;
  /** Modelo que respondió (puede no ser el elegido si ese estaba sin cupo). */
  model: string;
}

export type ModelTier = "Avanzado" | "Intermedio" | "Básico";

/**
 * Nombre visible y "ranking de inteligencia" de los modelos conocidos (1 = el más capaz, por tamaño).
 * Un modelo de OPENROUTER_MODELS que no esté acá se muestra con su id, al final.
 */
const MODEL_CATALOG: Record<string, { label: string; rank: number; tier: ModelTier }> = {
  "nvidia/nemotron-3-super-120b-a12b:free": { label: "Nemotron 3 Super 120B", rank: 1, tier: "Avanzado" },
  "google/gemma-4-31b-it:free": { label: "Gemma 4 31B", rank: 2, tier: "Intermedio" },
  "qwen/qwen3.8-27b:free": { label: "Qwen 3.8 27B", rank: 3, tier: "Intermedio" },
  "google/gemma-4-26b-a4b-it:free": { label: "Gemma 4 26B", rank: 4, tier: "Básico" },
};

export interface ModelStatus {
  id: string;
  label: string;
  rank: number;
  tier: ModelTier;
  /** false si se quedó sin cupo o falló hace poco (está en pausa). */
  available: boolean;
  /** Cuándo se puede volver a usar (ISO), si está en pausa. */
  resets_at: string | null;
}

/** Modelo → hasta cuándo está en pausa (en memoria; se reinicia con el servidor). */
const cooldowns = new Map<string, number>();

/** Para los tests. */
export function resetModelCooldowns(): void {
  cooldowns.clear();
}

/** true si hay una key configurada (sin ella el asistente responde "no disponible"). */
export function isOpenRouterConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}

export function modelLabel(model: string): string {
  return MODEL_CATALOG[model]?.label ?? model;
}

/** Los modelos configurados, del más capaz al más básico, con su estado actual. */
export function getModelStatuses(now = Date.now()): ModelStatus[] {
  return env.openRouterModels
    .map((id, index) => {
      const info = MODEL_CATALOG[id];
      const pausedUntil = cooldowns.get(id) ?? 0;
      return {
        id,
        label: info?.label ?? id,
        rank: info?.rank ?? 100 + index,
        tier: info?.tier ?? "Básico",
        available: pausedUntil <= now,
        resets_at: pausedUntil > now ? new Date(pausedUntil).toISOString() : null,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

/**
 * A qué hora se restablece el cupo según OpenRouter: cabecera X-RateLimit-Reset de la respuesta
 * o la que viene dentro del error (metadata.headers). Puede venir en milisegundos o en segundos.
 */
function resetFromRateLimit(response: Response, body: unknown): number | null {
  const fromBody = (body as { error?: { metadata?: { headers?: Record<string, unknown> } } } | null)?.error?.metadata
    ?.headers?.["X-RateLimit-Reset"];
  const raw = response.headers.get("x-ratelimit-reset") ?? (fromBody === undefined ? null : String(fromBody));
  const value = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}

/** Resultado de probar un modelo: la respuesta, o por qué hay que pasar al siguiente. */
type Attempt =
  | { ok: true; reply: string }
  | { ok: false; reason: string; pauseUntil: number | null; rateLimited: boolean }
  | { ok: false; fatal: AppError };

async function tryModel(model: string, apiKey: string, messages: ChatMessage[], options: CompletionOptions): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": env.frontendAppUrl,
        "X-Title": "NexPay",
      },
      body: JSON.stringify({
        model,
        messages,
        // Margen amplio: algunos modelos gratis "piensan" antes de responder y gastan parte del límite.
        max_tokens: options.maxTokens ?? 900,
        temperature: options.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "sin respuesta (timeout o red)", pauseUntil: null, rateLimited: false };
  }

  // Key inválida o revocada: ningún modelo va a funcionar, no tiene sentido seguir probando.
  if (response.status === 401 || response.status === 403) {
    logger.error("asistente: OpenRouter rechazó la key", { status: response.status });
    return { ok: false, fatal: new AppError(503, "ASSISTANT_UNAVAILABLE", "El asistente no está disponible en este momento.") };
  }

  const body: unknown = await response.json().catch(() => null);
  const now = Date.now();

  // 429: el modelo se quedó sin cupo (gratis: límite por minuto/día). Se pausa hasta que OpenRouter diga.
  if (response.status === 429) {
    const reset = resetFromRateLimit(response, body);
    const pauseUntil = Math.min(reset && reset > now ? reset : now + COOLDOWN_RATE_LIMITED_MS, now + MAX_COOLDOWN_MS);
    return { ok: false, reason: "sin cupo (429)", pauseUntil, rateLimited: true };
  }
  // 402: pide crédito. 404: el modelo ya no existe.
  if (response.status === 402 || response.status === 404) {
    return { ok: false, reason: `no disponible (${response.status})`, pauseUntil: now + COOLDOWN_UNAVAILABLE_MS, rateLimited: false };
  }
  if (!response.ok) return { ok: false, reason: `error ${response.status}`, pauseUntil: null, rateLimited: false };

  const reply = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    return { ok: false, reason: "respuesta vacía", pauseUntil: null, rateLimited: false };
  }
  return { ok: true, reply: reply.trim() };
}

/**
 * Pide una respuesta a OpenRouter: primero el modelo elegido (si hay), después los demás disponibles
 * en el orden de OPENROUTER_MODELS. Si uno se quedó sin cupo, no responde o falla, pasa enseguida al siguiente.
 * Adaptado del chat de Dragon Ball: acá la key y el prompt viven solo en el servidor.
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || env.openRouterModels.length === 0) {
    throw new AppError(503, "ASSISTANT_UNAVAILABLE", "El asistente no está disponible en este momento.");
  }

  const now = Date.now();
  const preferred = options.preferredModel && env.openRouterModels.includes(options.preferredModel) ? options.preferredModel : null;
  const ordered = preferred ? [preferred, ...env.openRouterModels.filter((m) => m !== preferred)] : env.openRouterModels;
  // Primero los disponibles; los que están en pausa quedan al final por si todos los demás fallan.
  const available = ordered.filter((model) => (cooldowns.get(model) ?? 0) <= now);
  const paused = ordered.filter((model) => (cooldowns.get(model) ?? 0) > now);

  let anyRateLimited = false;
  for (const model of [...available, ...paused]) {
    const attempt = await tryModel(model, apiKey, messages, options);
    if (attempt.ok) {
      cooldowns.delete(model);
      logger.info("asistente: respondió", { model });
      return { reply: attempt.reply, model };
    }
    if ("fatal" in attempt) throw attempt.fatal;
    if (attempt.pauseUntil) cooldowns.set(model, attempt.pauseUntil);
    if (attempt.rateLimited) anyRateLimited = true;
    logger.warn("asistente: se pasa al siguiente modelo", { model, reason: attempt.reason });
  }

  throw anyRateLimited
    ? new AppError(429, "ASSISTANT_BUSY", "Todos los modelos están sin cupo por ahora. Inténtalo en unos minutos.")
    : new AppError(502, "ASSISTANT_ERROR", "El asistente no pudo responder. Inténtalo de nuevo.");
}
