import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { transactionsRepository, type TransactionRecord } from "../../src/modules/transactions/transactions.repository";
import {
  BALANCE_EXCHANGE_TYPES,
  OWN_TRANSACTION_TYPES,
  parseExchangeQuery,
  parseHistoryQuery,
} from "../../src/modules/transactions/transactions.middlewares";
import { classifyExchange, transactionsService } from "../../src/modules/transactions/transactions.service";
import { walletsRepository } from "../../src/modules/wallets/wallets.repository";
import { AppError } from "../../src/utils/app-error";

const userId = "11111111-1111-4111-8111-111111111111";
const wallet = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: userId,
  created_at: "2026-10-06T10:00:00.000Z",
  updated_at: "2026-10-06T10:00:00.000Z",
};

const transaction: TransactionRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  wallet_id: wallet.id,
  type: "EXCHANGE",
  from_currency: "USD",
  to_currency: "COP",
  from_amount: "10.00",
  to_amount: "40000.00",
  exchange_rate: "4000.0000000000",
  fee_amount: "0.05",
  fee_currency: "USD",
  fee_percent: "0.5",
  ars_rate_type: null,
  created_at: new Date("2026-10-06T10:00:00.000Z"),
};

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return "SIN_ERROR";
}

afterEach(() => mock.restoreAll());

describe("Transactions: clasificación", () => {
  it("clasifica compras, ventas e intercambios según las monedas locales", () => {
    assert.equal(classifyExchange("COP", "USD"), "BUY");
    assert.equal(classifyExchange("USD", "ARS"), "SELL");
    assert.equal(classifyExchange("COP", "ARS"), "EXCHANGE");
    assert.equal(classifyExchange("USD", "EUR"), "EXCHANGE");
  });
});

describe("Transactions: validación", () => {
  it("normaliza las monedas y aplica MEP por defecto al cotizar", () => {
    assert.deepEqual(
      parseExchangeQuery({ from_currency: " usd ", to_currency: "cop", amount: "10.5" }),
      { from_currency: "USD", to_currency: "COP", amount: 10.5, ars_rate: "mep" },
    );
  });

  it("rechaza monedas iguales, montos inválidos, dólar blue y campos controlados por el servidor", () => {
    const invalidQueries = [
      { from_currency: "USD", to_currency: "USD", amount: 1 },
      { from_currency: "USD", to_currency: "COP", amount: 0 },
      { from_currency: "USD", to_currency: "COP", amount: 1, ars_rate: "blue" },
      { from_currency: "USD", to_currency: "COP", amount: 1, exchange_rate: 4000 },
      { from_currency: "USD", to_currency: "COP", amount: 1, wallet_id: wallet.id },
    ];

    for (const query of invalidQueries) {
      assert.equal(errorCode(() => parseExchangeQuery(query)), "INVALID_EXCHANGE_PAYLOAD");
    }
  });

  it("aplica paginación predeterminada y valida filtros de historial", () => {
    assert.deepEqual(parseHistoryQuery({}), { page: 1, limit: 20 });
    assert.deepEqual(parseHistoryQuery({ type: "EXCHANGE", page: "2", limit: "50" }), {
      type: "EXCHANGE",
      page: 2,
      limit: 50,
    });
    assert.equal(errorCode(() => parseHistoryQuery({ type: "P2P" })), "INVALID_HISTORY_QUERY");
    assert.equal(errorCode(() => parseHistoryQuery({ limit: "51" })), "INVALID_HISTORY_QUERY");
    assert.equal(errorCode(() => parseHistoryQuery({ page: "0" })), "INVALID_HISTORY_QUERY");
  });
});

describe("Transactions: historial propio", () => {
  it("filtra por tipos de operación y devuelve montos numéricos normalizados", async () => {
    mock.method(walletsRepository, "findByUserId", async () => wallet);
    const findPage = mock.method(transactionsRepository, "findPageByWallet", async () => ({
      rows: [transaction],
      total: 1,
    }));

    const all = await transactionsService.listMine(userId, { page: 2, limit: 10 });
    const deposits = await transactionsService.listMine(userId, { page: 1, limit: 20, type: "DEPOSIT" });
    const exchanges = await transactionsService.listMine(userId, { page: 1, limit: 20, type: "EXCHANGE" });

    assert.deepEqual(findPage.mock.calls.map((call) => call.arguments[1]), [
      { types: [...OWN_TRANSACTION_TYPES], limit: 10, offset: 10 },
      { types: ["DEPOSIT"], limit: 20, offset: 0 },
      { types: [...BALANCE_EXCHANGE_TYPES], limit: 20, offset: 0 },
    ]);
    assert.deepEqual(all, {
      items: [{
        id: transaction.id,
        type: "EXCHANGE",
        from_currency: "USD",
        to_currency: "COP",
        from_amount: "10.00",
        to_amount: "40000.00",
        exchange_rate: 4000,
        fee_amount: "0.05",
        fee_currency: "USD",
        fee_percent: 0.5,
        ars_rate_type: null,
        created_at: "2026-10-06T10:00:00.000Z",
      }],
      page: 2,
      limit: 10,
      total: 1,
    });
    assert.equal(deposits.total, 1);
    assert.equal(exchanges.total, 1);
  });

  it("responde WALLET_NOT_FOUND si el usuario no tiene wallet", async () => {
    mock.method(walletsRepository, "findByUserId", async () => null);

    await assert.rejects(
      transactionsService.listMine(userId, { page: 1, limit: 20 }),
      (error: unknown) => error instanceof AppError && error.code === "WALLET_NOT_FOUND",
    );
  });
});
