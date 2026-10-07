import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { app } from "../../src/app";
import { env } from "../../src/config/env";
import { authRepository, type AuthUserRecord } from "../../src/modules/auth/auth.repository";
import { transactionsService } from "../../src/modules/transactions/transactions.service";

const user: AuthUserRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ana Pérez",
  email: "ana@nexpay.com",
  password_hash: null,
  session_version: 0,
  role: "user",
  is_owner: false,
  status: "active",
  created_at: new Date("2026-10-06T10:00:00.000Z"),
  deleted_at: null,
};

const token = jwt.sign({ sv: 0 }, env.JWT_SECRET, {
  subject: user.id,
  jwtid: "transactions-http-test",
  expiresIn: "1h",
  algorithm: "HS256",
});

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  mock.method(authRepository, "findActiveById", async () => user);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
});

describe("HTTP /api/transactions/me/exchange", () => {
  it("valida el query real de Express y entrega la cotización del servicio", async () => {
    const quote = {
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      from_amount: "100000.00",
      fee_amount: "500.00",
      converted_amount: "99500.00",
      rate: 0.00025,
      to_amount: "24.88",
    };
    const quoteExchange = mock.method(transactionsService, "quoteExchange", async () => quote);

    const response = await fetch(
      `${baseUrl}/api/transactions/me/exchange/quote?from_currency=cop&to_currency=usd&amount=100000`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: quote });
    assert.deepEqual(quoteExchange.mock.calls[0]?.arguments, [{
      from_currency: "COP",
      to_currency: "USD",
      amount: 100000,
      ars_rate: "mep",
    }]);
  });

  it("responde 400 en Express si el query es inválido y no cotiza", async () => {
    const quoteExchange = mock.method(transactionsService, "quoteExchange", async () => {
      throw new Error("No debe invocarse");
    });

    const response = await fetch(
      `${baseUrl}/api/transactions/me/exchange/quote?from_currency=USD&to_currency=USD&amount=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json() as { error: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "INVALID_EXCHANGE_PAYLOAD");
    assert.equal(quoteExchange.mock.callCount(), 0);
  });

  it("ejecuta el POST validado con el usuario del token y responde 201", async () => {
    const result = {
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      amount: 100000,
      transaction_id: "33333333-3333-4333-8333-333333333333",
    };
    const exchange = mock.method(transactionsService, "exchange", async () => result);

    const response = await fetch(`${baseUrl}/api/transactions/me/exchange`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from_currency: " cop ", to_currency: "usd", amount: "100000" }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: result });
    assert.deepEqual(exchange.mock.calls[0]?.arguments, [user.id, {
      from_currency: "COP",
      to_currency: "USD",
      amount: 100000,
      ars_rate: "mep",
    }]);
  });

  it("rechaza un POST con campos de wallet o tasa enviados por el cliente", async () => {
    const exchange = mock.method(transactionsService, "exchange", async () => {
      throw new Error("No debe invocarse");
    });

    const response = await fetch(`${baseUrl}/api/transactions/me/exchange`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_currency: "COP",
        to_currency: "USD",
        amount: 100,
        wallet_id: "wallet-controlada",
        exchange_rate: 1,
      }),
    });
    const body = await response.json() as { error: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "INVALID_EXCHANGE_PAYLOAD");
    assert.equal(exchange.mock.callCount(), 0);
  });
});
