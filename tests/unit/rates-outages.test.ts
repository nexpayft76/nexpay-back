import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { pool } from "../../src/config/db";
import { env } from "../../src/config/env";
import { currenciesRepository, type CurrencyRecord } from "../../src/modules/currencies/currencies.repository";
import { ratesService, getRateSnapshot, clearRatesCache } from "../../src/modules/rates/rates.service";
import { AppError } from "../../src/utils/app-error";

const currencies: CurrencyRecord[] = [
  { code: "USD", name: "Dólar estadounidense", decimals: 2, is_active: true },
  { code: "COP", name: "Peso colombiano", decimals: 2, is_active: true },
  { code: "ARS", name: "Peso argentino", decimals: 2, is_active: true },
];

const frankfurterResponse = [{
  date: "2026-10-06",
  base: "USD",
  quote: "COP",
  rate: 4000,
}];

const dolarApiResponse = [
  { casa: "oficial", compra: 900, venta: 950, fechaActualizacion: "2026-10-06T10:00:00.000Z" },
  { casa: "bolsa", compra: 1100, venta: 1200, fechaActualizacion: "2026-10-06T10:05:00.000Z" },
  { casa: "blue", compra: 1300, venta: 1400, fechaActualizacion: "2026-10-06T10:10:00.000Z" },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let frankfurterDown = false;
let dolarApiDown = false;

function providerResponse(url: string): Response {
  if (url.startsWith(env.FRANKFURTER_BASE_URL)) {
    if (frankfurterDown) throw new Error("Frankfurter no disponible");
    return jsonResponse(frankfurterResponse);
  }
  if (url.startsWith(env.DOLARAPI_BASE_URL)) {
    if (dolarApiDown) throw new Error("DolarApi no disponible");
    return jsonResponse(dolarApiResponse);
  }
  throw new Error(`Proveedor inesperado: ${url}`);
}

beforeEach(() => {
  clearRatesCache();
  frankfurterDown = false;
  dolarApiDown = false;
  mock.method(currenciesRepository, "findAll", async () => currencies);
  mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => providerResponse(String(input)));
});

afterEach(() => {
  clearRatesCache();
  mock.restoreAll();
});

describe("Rates: fallos y tasas desactualizadas", () => {
  it("marca como fallback los proveedores caídos, conserva tasas previas y agrega avisos", async () => {
    let now = Date.now();
    mock.method(Date, "now", () => now);

    const live = await getRateSnapshot();
    assert.equal(live.source, "live");
    assert.deepEqual(live.unavailable, []);

    now += Math.max(env.RATES_CACHE_TTL_SECONDS, env.ARS_RATES_CACHE_TTL_SECONDS) * 1000 + 1;
    frankfurterDown = true;
    dolarApiDown = true;

    const stale = await getRateSnapshot();

    assert.equal(stale.source, "fallback");
    assert.equal(stale.table.rates.COP, 4000);
    assert.equal(stale.table.rates.ARS, 1150);
    assert.deepEqual(stale.unavailable, []);
    assert.deepEqual(stale.providers.map(({ provider, source, stale: isStale }) => ({
      provider,
      source,
      stale: isStale,
    })), [
      { provider: "frankfurter", source: "fallback", stale: true },
      { provider: "dolarapi", source: "fallback", stale: true },
    ]);
    assert.equal(stale.warnings.length, 2);
    assert.match(stale.warnings[0] ?? "", /Frankfurter \(COP\).*última tasa válida/);
    assert.match(stale.warnings[1] ?? "", /DolarApi \(ARS\).*última tasa válida/);
  });

  it("devuelve un snapshot parcial y advierte qué proveedor y monedas no están disponibles", async () => {
    frankfurterDown = true;

    const snapshot = await getRateSnapshot();

    assert.equal(snapshot.source, "live");
    assert.deepEqual(snapshot.unavailable, ["COP"]);
    assert.equal(snapshot.table.rates.ARS, 1150);
    assert.deepEqual(snapshot.providers.map(({ provider }) => provider), ["dolarapi"]);
    assert.deepEqual(snapshot.warnings, ["No hay ninguna tasa registrada para COP."]);
    await assert.rejects(
      ratesService.getRates("COP"),
      (error: unknown) => error instanceof AppError && error.code === "RATES_UNAVAILABLE",
    );
  });

  it("indica proveedor y moneda cuando DolarApi falla sin respaldo", async () => {
    dolarApiDown = true;

    const snapshot = await getRateSnapshot();

    assert.deepEqual(snapshot.unavailable, ["ARS"]);
    assert.equal(snapshot.table.rates.COP, 4000);
    assert.match(snapshot.warnings[0] ?? "", /No hay ninguna tasa registrada para ARS/);
  });

  it("responde 503 RATES_UNAVAILABLE si todos los proveedores fallan y no hay respaldo válido", async () => {
    frankfurterDown = true;
    dolarApiDown = true;

    await assert.rejects(
      getRateSnapshot(),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 503 &&
        error.code === "RATES_UNAVAILABLE",
    );
  });
});
