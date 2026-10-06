import "../helpers/test-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArsQuotes } from "../../src/integrations/dolarapi.client";
import type { CurrencyRecord } from "../../src/modules/currencies/currencies.repository";
import {
  assertSupported,
  crossRate,
  quoteRate,
  type RateSnapshot,
} from "../../src/modules/rates/rates.service";
import { AppError } from "../../src/utils/app-error";

const currencies: CurrencyRecord[] = [
  { code: "USD", name: "Dólar estadounidense", decimals: 2, is_active: true },
  { code: "COP", name: "Peso colombiano", decimals: 2, is_active: true },
  { code: "ARS", name: "Peso argentino", decimals: 2, is_active: true },
];

const ars: ArsQuotes = {
  oficial: {
    compra: 900,
    venta: 950,
    mid: 925,
    published_at: "2026-10-06T10:00:00.000Z",
  },
  mep: {
    compra: 1100,
    venta: 1200,
    mid: 1150,
    published_at: "2026-10-06T10:05:00.000Z",
  },
};

const snapshot: RateSnapshot = {
  table: { date: "2026-10-06", rates: { USD: 1, COP: 4000, ARS: 1150 } },
  ars,
  source: "live",
  fetched_at: "2026-10-06T10:05:00.000Z",
  currencies,
  providers: [],
  unavailable: [],
  warnings: [],
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

describe("Rates: tasas cruzadas", () => {
  it("calcula monedas cruzadas usando USD como pivote y redondea a diez decimales", () => {
    assert.equal(crossRate(snapshot.table, "USD", "COP"), 4000);
    assert.equal(crossRate(snapshot.table, "COP", "USD"), 0.00025);
    assert.equal(crossRate(snapshot.table, "COP", "ARS"), 0.2875);
  });

  it("rechaza tasas ausentes con RATES_UNAVAILABLE", () => {
    assert.equal(errorCode(() => crossRate(snapshot.table, "EUR", "COP")), "RATES_UNAVAILABLE");
    assert.equal(errorCode(() => crossRate(snapshot.table, "USD", "EUR")), "RATES_UNAVAILABLE");
  });

  it("encuentra monedas activas y rechaza códigos no soportados", () => {
    assert.equal(assertSupported(currencies, "COP"), currencies[1]);
    assert.equal(errorCode(() => assertSupported(currencies, "EUR")), "UNSUPPORTED_CURRENCY");
  });
});

describe("Rates: cotizaciones de ARS", () => {
  it("usa compra cuando el usuario recibe ARS y conserva el tipo elegido", () => {
    const result = quoteRate(snapshot, "USD", "ARS", "mep");

    assert.equal(result.rate, 1100);
    assert.deepEqual(result.ars_rate, {
      type: "mep",
      label: "MEP (bolsa)",
      price_used: "compra",
      compra: 1100,
      venta: 1200,
      published_at: "2026-10-06T10:05:00.000Z",
    });
  });

  it("usa venta cuando el usuario paga ARS y permite elegir dólar oficial", () => {
    const result = quoteRate(snapshot, "ARS", "USD", "oficial");

    assert.equal(result.rate, 0.0010526316);
    assert.equal(result.ars_rate?.type, "oficial");
    assert.equal(result.ars_rate?.price_used, "venta");
  });

  it("usa la tasa cruzada regular si ARS no participa", () => {
    const result = quoteRate(snapshot, "USD", "COP");

    assert.deepEqual(result, { rate: 4000, ars_rate: null });
  });

  it("rechaza el tipo de dólar no disponible", () => {
    const withoutBlue: RateSnapshot = { ...snapshot, ars: { oficial: ars.oficial, mep: ars.mep } };

    assert.equal(errorCode(() => quoteRate(withoutBlue, "USD", "ARS", "blue")), "RATES_UNAVAILABLE");
  });
});
