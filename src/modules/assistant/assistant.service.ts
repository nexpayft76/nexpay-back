import { env } from "../../config/env";
import { ARS_RATE_TYPES, type ArsRateType } from "../../integrations/dolarapi.client";
import { createChatCompletion, getModelStatuses, modelLabel, type ChatMessage, type ModelStatus } from "../../integrations/openrouter.client";
import { logger } from "../../utils/logger";
import { authRepository } from "../auth/auth.repository";
import { getRateSnapshot, quoteRate } from "../rates/rates.service";
import { transactionsRepository } from "../transactions/transactions.repository";
import { DEPOSIT_LIMITS, walletsService } from "../wallets/wallets.service";
import { walletsRepository } from "../wallets/wallets.repository";
import {
  buildSystemPrompt,
  type AssistantArsQuote,
  type AssistantBalance,
  type AssistantContext,
  type AssistantMovement,
  type AssistantRate,
} from "./assistant.prompt";

const CURRENCIES = ["COP", "ARS", "USD", "EUR"] as const;
const TYPE_LABEL: Record<string, string> = { BUY: "compra", SELL: "venta", EXCHANGE: "intercambio", DEPOSIT: "recarga" };

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  reply: string;
  /** Modelo que respondió (puede no ser el elegido si ese estaba sin cupo). */
  model: string;
  model_label: string;
}

/** Tasas de todos los pares (las mismas del cotizador, ARS al dólar MEP) y las cotizaciones del dólar en Argentina. */
async function loadRates(): Promise<Pick<AssistantContext, "rates" | "arsQuotes" | "ratesDate">> {
  try {
    const snapshot = await getRateSnapshot();
    const rates: AssistantRate[] = [];
    for (const from of CURRENCIES) {
      for (const to of CURRENCIES) {
        if (from === to || snapshot.unavailable.includes(from) || snapshot.unavailable.includes(to)) continue;
        try {
          rates.push({ from, to, rate: quoteRate(snapshot, from, to).rate });
        } catch {
          // Ese par no tiene tasa ahora: el asistente lo dirá en vez de inventarla.
        }
      }
    }
    const arsQuotes: AssistantArsQuote[] = [];
    for (const [type, quote] of Object.entries(snapshot.ars ?? {})) {
      if (quote) arsQuotes.push({ type: ARS_RATE_TYPES[type as ArsRateType].label, compra: quote.compra, venta: quote.venta });
    }
    return { rates, arsQuotes, ratesDate: snapshot.table.date };
  } catch (error) {
    logger.warn("asistente: sin tasas para el contexto", { error });
    return { rates: [], arsQuotes: [], ratesDate: null };
  }
}

/** Saldos (con su equivalente en USD) y últimos movimientos del usuario. Solo lectura. */
async function loadUserData(
  userId: string,
): Promise<Pick<AssistantContext, "balances" | "totalUsd" | "movements">> {
  try {
    const wallet = await walletsService.getMyWallet(userId, "USD");
    const balances: AssistantBalance[] = wallet.balances.map((b) => ({
      currency: b.currency,
      amount: Number(b.amount),
      valueInUsd: b.currency === "USD" ? Number(b.amount) : b.value_in_target,
    }));
    const walletRecord = await walletsRepository.findByUserId(userId);
    const recent = walletRecord ? await transactionsRepository.findRecentByWallet(walletRecord.id, 8) : [];
    const movements: AssistantMovement[] = recent.map((t) => ({
      type: TYPE_LABEL[t.type] ?? t.type,
      date: new Date(t.created_at).toISOString().slice(0, 10),
      from: t.from_currency,
      to: t.to_currency,
      fromAmount: Number(t.from_amount),
      toAmount: Number(t.to_amount),
    }));
    return { balances, totalUsd: wallet.valuation?.total ?? null, movements };
  } catch (error) {
    logger.warn("asistente: sin datos del usuario para el contexto", { error });
    return { balances: [], totalUsd: null, movements: [] };
  }
}

export async function buildAssistantContext(userId: string): Promise<AssistantContext> {
  const [user, rates, data] = await Promise.all([
    authRepository.findActiveById(userId),
    loadRates(),
    loadUserData(userId),
  ]);
  return {
    now: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }),
    userName: user?.full_name ?? "usuario",
    feePercent: env.EXCHANGE_FEE_PERCENT,
    depositLimits: DEPOSIT_LIMITS,
    ...rates,
    ...data,
  };
}

export const assistantService = {
  /**
   * Responde un mensaje del usuario. El asistente solo enseña, explica, sugiere y calcula:
   * no tiene ninguna herramienta para mover dinero ni cambiar datos (las operaciones las hace el usuario).
   */
  async chat(userId: string, message: string, history: AssistantTurn[], preferredModel?: string): Promise<AssistantReply> {
    const context = await buildAssistantContext(userId);
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(context) },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: message },
    ];
    const { reply, model } = await createChatCompletion(messages, { preferredModel });
    logger.info("asistente: respuesta enviada", { user_id: userId, history: history.length, model });
    return { reply, model, model_label: modelLabel(model) };
  },

  /** Modelos disponibles, del más capaz al más básico, con su estado (disponible o sin cupo hasta tal hora). */
  models(): ModelStatus[] {
    return getModelStatuses();
  },
};
