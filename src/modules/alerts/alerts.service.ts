import { AppError } from "../../utils/app-error";
import { logger } from "../../utils/logger";
import { currenciesRepository } from "../currencies/currencies.repository";
import { ratesHistoryService } from "../rates/rates.history.service";
import { notificationsService } from "../notifications/notifications.service";
import { alertsRepository } from "./alerts.repository";
import type { AlertRule, CreateAlertInput, UpdateAlertInput } from "./alerts.types";

interface RateSnapshotForAlerts {
  table: { rates: Record<string, number> };
  providers: Array<{ currencies: string[]; fetched_at: string }>;
}

interface BalanceChange {
  currency: string;
  amount: string;
}

export function matchesDirection(direction: "up" | "down", value: number, threshold: number): boolean {
  return direction === "up" ? value >= threshold : value <= threshold;
}

export function formatAlertNumber(value: number | string): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : String(value);
}

async function assertCurrencies(codes: string[]): Promise<void> {
  const supported = new Set((await currenciesRepository.findAll()).map(({ code }) => code));
  const unsupported = codes.find((code) => !supported.has(code));
  if (unsupported) throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${unsupported}`);
}

async function sendEventEmail(rule: AlertRule, eventKey: string, title: string, message: string): Promise<void> {
  const user = await alertsRepository.claimEvent(rule.id, eventKey);
  if (user) await notificationsService.sendAlertEmail({ user, title, message });
}

async function evaluateBalanceRules(userId: string, balances: BalanceChange[], eventKey: string): Promise<void> {
  for (const balance of balances) {
    const rules = await alertsRepository.findEventRules(userId, "low_balance", balance.currency);
    for (const rule of rules) {
      if (Number(balance.amount) <= rule.threshold) {
        await sendEventEmail(
          rule,
          `${eventKey}:${balance.currency}:low`,
          `Saldo bajo en ${balance.currency}`,
          `Tu saldo quedó en ${formatAlertNumber(balance.amount)} ${balance.currency}.`,
        );
      }
    }
  }
}

function currentRate(snapshot: RateSnapshotForAlerts, rule: AlertRule): number | null {
  const base = snapshot.table.rates[rule.base_currency];
  const currency = snapshot.table.rates[rule.currency];
  if (base === undefined || currency === undefined || base === 0) return null;
  return currency / base;
}

async function rateConditionMet(rule: AlertRule, snapshot: RateSnapshotForAlerts): Promise<boolean> {
  if (rule.kind === "stale_rates") {
    const provider = snapshot.providers.find(({ currencies }) => currencies.includes(rule.currency));
    if (!provider) return false;
    const fetchedAt = Date.parse(provider.fetched_at);
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt > rule.threshold * 60_000;
  }

  const rate = currentRate(snapshot, rule);
  if (rate === null) return false;
  if (rule.kind === "target_rate") {
    return rule.direction === "up" ? rate > rule.threshold : rate < rule.threshold;
  }

  if (rule.kind !== "daily_change" || rule.currency === rule.base_currency) return false;
  try {
    const history = await ratesHistoryService.getPairHistory(rule.base_currency, rule.currency, "1w");
    const series = history.series.find(({ key }) => key === "mep") ?? history.series[0];
    const points = series?.points.slice(-2) ?? [];
    const previous = points[0]?.value;
    const latest = points[1]?.value;
    if (previous === undefined || latest === undefined || previous === 0) return false;
    const changePercent = ((latest - previous) / previous) * 100;
    const limit = rule.direction === "up" ? rule.threshold : -rule.threshold;
    return matchesDirection(rule.direction, changePercent, limit);
  } catch {
    return false;
  }
}

function rateEmail(rule: AlertRule): { title: string; message: string } {
  if (rule.kind === "stale_rates") {
    return {
      title: `Tasas desactualizadas para ${rule.currency}`,
      message: `La fuente de tasas lleva más de ${formatAlertNumber(rule.threshold)} minutos sin publicar datos nuevos.`,
    };
  }
  if (rule.kind === "daily_change") {
    const movement = rule.direction === "up" ? "subió más" : "bajó más";
    return {
      title: `Variación diaria de ${rule.currency}`,
      message: `${rule.currency} ${movement} del ${formatAlertNumber(rule.threshold)}% frente a ${rule.base_currency}.`,
    };
  }
  return {
    title: `Se cumplió tu tasa objetivo para ${rule.currency}`,
    message: `1 ${rule.base_currency} ${rule.direction === "up" ? "superó" : "bajó de"} ${formatAlertNumber(rule.threshold)} ${rule.currency}.`,
  };
}

export const alertsService = {
  list: (userId: string) => alertsRepository.findByUser(userId),

  async create(userId: string, input: CreateAlertInput): Promise<AlertRule> {
    await assertCurrencies([input.currency, input.base_currency]);
    return alertsRepository.create(userId, input);
  },

  async update(userId: string, id: string, input: UpdateAlertInput): Promise<AlertRule> {
    await assertCurrencies([input.currency, input.base_currency].filter((code): code is string => Boolean(code)));
    const alert = await alertsRepository.update(userId, id, input);
    if (!alert) throw new AppError(404, "ALERT_NOT_FOUND", "No se encontró la alerta");
    return alert;
  },

  async delete(userId: string, id: string): Promise<void> {
    if (!(await alertsRepository.delete(userId, id))) {
      throw new AppError(404, "ALERT_NOT_FOUND", "No se encontró la alerta");
    }
  },

  async onDeposit(userId: string, event: {
    transactionId: string;
    currency: string;
    amount: string;
    newBalance: string;
  }): Promise<void> {
    try {
      const depositRules = await alertsRepository.findEventRules(userId, "deposit_received", event.currency);
      for (const rule of depositRules) {
        await sendEventEmail(
          rule,
          `${event.transactionId}:deposit`,
          `Recarga recibida en ${event.currency}`,
          `Sumaste ${formatAlertNumber(event.amount)} ${event.currency} a tu wallet.`,
        );
      }
      await evaluateBalanceRules(userId, [{ currency: event.currency, amount: event.newBalance }], event.transactionId);
    } catch (error) {
      logger.error("No se pudieron evaluar las alertas de recarga", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async onBalancesChanged(userId: string, balances: BalanceChange[], eventKey: string): Promise<void> {
    try {
      await evaluateBalanceRules(userId, balances, eventKey);
    } catch (error) {
      logger.error("No se pudieron evaluar las alertas de saldo", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async evaluateRateRules(snapshot: RateSnapshotForAlerts): Promise<void> {
    try {
      const rules = await alertsRepository.findRateRules();
      for (const rule of rules) {
        const conditionMet = await rateConditionMet(rule, snapshot);
        const user = await alertsRepository.setCondition(rule.id, conditionMet);
        if (user && conditionMet) {
          const email = rateEmail(rule);
          await notificationsService.sendAlertEmail({ user, ...email });
        }
      }
    } catch (error) {
      logger.error("No se pudieron evaluar las alertas de tasas", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};