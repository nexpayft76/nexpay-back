import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { PoolClient } from "pg";
import { pool } from "../../src/config/db";
import { env } from "../../src/config/env";
import { currenciesRepository, type CurrencyRecord } from "../../src/modules/currencies/currencies.repository";
import { alertsService } from "../../src/modules/alerts/alerts.service";
import { settingsService } from "../../src/modules/settings/settings.service";
import { transactionsRepository, type TransactionRecord } from "../../src/modules/transactions/transactions.repository";
import { transactionsService } from "../../src/modules/transactions/transactions.service";
import { usersRepository } from "../../src/modules/users/users.repository";
import { walletsRepository } from "../../src/modules/wallets/wallets.repository";
import { notificationsService } from "../../src/modules/notifications";
import { clearRatesCache } from "../../src/modules/rates/rates.service";
import { AppError } from "../../src/utils/app-error";

const userId = "11111111-1111-4111-8111-111111111111";
const wallet = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: userId,
  created_at: "2026-10-06T10:00:00.000Z",
  updated_at: "2026-10-06T10:00:00.000Z",
};

const currencies: CurrencyRecord[] = [
  { code: "USD", name: "Dólar estadounidense", decimals: 2, is_active: true },
  { code: "COP", name: "Peso colombiano", decimals: 2, is_active: true },
];

const transaction: TransactionRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  wallet_id: wallet.id,
  type: "BUY",
  from_currency: "COP",
  to_currency: "USD",
  from_amount: "100000.00",
  to_amount: "24.88",
  exchange_rate: "0.0002500000",
  fee_amount: "500.00",
  fee_currency: "COP",
  fee_percent: "0.5",
  ars_rate_type: null,
  created_at: new Date("2026-10-06T10:00:00.000Z"),
};

const exchangeRateResponse = [{
  date: "2026-10-06",
  base: "USD",
  quote: "COP",
  rate: 4000,
}];

let selectedCurrencies = currencies;
let fetchCalls = 0;
let fetchProvider = async (_input: string | URL | Request): Promise<Response> => {
  const response = selectedCurrencies.some(({ code }) => code === "EUR")
    ? [...exchangeRateResponse, {
      date: "2026-10-06",
      base: "USD",
      quote: "EUR",
      rate: 0.92,
    }]
    : exchangeRateResponse;
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

beforeEach(() => {
  clearRatesCache();
  settingsService.clearCache();
  selectedCurrencies = currencies;
  fetchCalls = 0;
  fetchProvider = async () => {
    const response = selectedCurrencies.some(({ code }) => code === "EUR")
      ? [...exchangeRateResponse, {
        date: "2026-10-06",
        base: "USD",
        quote: "EUR",
        rate: 0.92,
      }]
      : exchangeRateResponse;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  mock.method(currenciesRepository, "findAll", async () => selectedCurrencies);
  mock.method(walletsRepository, "findByUserId", async () => wallet);
  mock.method(settingsService, "getFees", async () => ({
    exchange_fee_percent: 0.5,
    p2p_fee_percent: 0.5,
  }));
  mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    fetchCalls += 1;
    return fetchProvider(input);
  });
});

afterEach(() => {
  clearRatesCache();
  settingsService.clearCache();
  mock.restoreAll();
});

describe("Transactions: cotización y ejecución del exchange", () => {
  it("cotiza el fee sobre el monto de origen y redondea el importe convertido a decimales destino", async () => {
    const quote = await transactionsService.quoteExchange({
      from_currency: "COP",
      to_currency: "USD",
      amount: 100000,
      ars_rate: "mep",
    });

    assert.deepEqual(quote, {
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      from_amount: "100000.00",
      fee_percent: 0.5,
      fee_amount: "500.00",
      converted_amount: "99500.00",
      rate: 0.00025,
      to_amount: "24.88",
      ars_rate: null,
      rates_date: "2026-10-06",
      rates_source: "live",
      warnings: [],
    });
  });

  it("ejecuta el exchange con la wallet autenticada y persiste tasa, fee y montos de la cotización", async () => {
    mock.method(alertsService, "onBalancesChanged", async () => {});
    mock.method(usersRepository, "findById", async () => null);
    mock.method(notificationsService, "sendExchangeEmail", async () => {});
    const applyExchange = mock.method(transactionsRepository, "applyExchange", async () => ({
      transaction,
      balances: { from: "25000.00", to: "124.88" },
    }));
    const client = {
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    } as unknown as PoolClient;
    const connect = mock.method(pool, "connect", async () => client);

    const result = await transactionsService.exchange(userId, {
      from_currency: "COP",
      to_currency: "USD",
      amount: 100000,
      ars_rate: "mep",
    });

    assert.deepEqual(result, {
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      from_amount: "100000.00",
      fee_percent: 0.5,
      fee_amount: "500.00",
      converted_amount: "99500.00",
      rate: 0.00025,
      to_amount: "24.88",
      ars_rate: null,
      rates_date: "2026-10-06",
      rates_source: "live",
      warnings: [],
      transaction_id: transaction.id,
      created_at: "2026-10-06T10:00:00.000Z",
      balances: { from: "25000.00", to: "124.88" },
    });
    assert.deepEqual(applyExchange.mock.calls[0]?.arguments[1], {
      wallet_id: wallet.id,
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      from_amount: "100000.00",
      to_amount: "24.88",
      exchange_rate: "0.0002500000",
      fee_amount: "500.00",
      fee_percent: "0.5",
      ars_rate_type: null,
    });
    assert.equal(connect.mock.callCount(), 1);
  });

  it("rechaza quote cuando la moneda existe pero está inactiva en el catálogo", async () => {
    selectedCurrencies = [
      ...currencies,
      { code: "EUR", name: "Euro", decimals: 2, is_active: false },
    ];

    await assert.rejects(
      transactionsService.quoteExchange({
        from_currency: "EUR",
        to_currency: "USD",
        amount: 10,
        ars_rate: "mep",
      }),
      (error: unknown) => error instanceof AppError && error.code === "UNSUPPORTED_CURRENCY",
    );
  });

  it("rechaza el quote cuando la moneda base está en el catálogo pero su tasa no está disponible", async () => {
    selectedCurrencies = [
      ...currencies,
      { code: "ARS", name: "Peso argentino", decimals: 2, is_active: true },
    ];
    fetchProvider = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(env.DOLARAPI_BASE_URL)) {
        return new Response(JSON.stringify([
          { casa: "bolsa", compra: 1100, venta: 1200, fechaActualizacion: "2026-10-06T10:05:00.000Z" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error("Frankfurter caído");
    };

    await assert.rejects(
      transactionsService.quoteExchange({
        from_currency: "COP",
        to_currency: "USD",
        amount: 100,
        ars_rate: "mep",
      }),
      (error: unknown) => error instanceof AppError && error.code === "RATES_UNAVAILABLE",
    );
  });

  it("responde WALLET_NOT_FOUND antes de obtener cotizaciones cuando no existe wallet", async () => {
    mock.method(walletsRepository, "findByUserId", async () => null);
    const applyExchange = mock.method(transactionsRepository, "applyExchange", async () => {
      throw new Error("No debe invocarse");
    });

    await assert.rejects(
      transactionsService.exchange(userId, {
        from_currency: "COP",
        to_currency: "USD",
        amount: 100,
        ars_rate: "mep",
      }),
      (error: unknown) => error instanceof AppError && error.code === "WALLET_NOT_FOUND",
    );
    assert.equal(applyExchange.mock.callCount(), 0);
    assert.equal(fetchCalls, 0);
  });
});
