import "../helpers/test-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildP2PEmail } from "../../src/modules/notifications/notifications.templates";
import { calculateOffer, formatMoney, publicName } from "../../src/modules/p2p/p2p.calc";
import { parseMarketFilters, parseOfferBody, parseOfferQuery } from "../../src/modules/p2p/p2p.middlewares";
import { AppError } from "../../src/utils/app-error";

/** Vende 100 USD por COP; mercado a 4.000, comisión 0,5% para cada uno, límite ±10%. */
const base = {
  sellAmount: 100,
  sellDecimals: 2,
  buyDecimals: 2,
  rate: 4100,
  marketRate: 4000,
  feePercent: 0.5,
  maxDeviationPercent: 10,
};

const errorCode = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return "SIN_ERROR";
};

describe("P2P: cálculo de la oferta", () => {
  it("calcula lo que paga el comprador, la comisión de cada uno y lo que recibe cada parte", () => {
    const calc = calculateOffer(base);
    assert.equal(calc.sell_amount, "100.00");
    assert.equal(calc.buy_amount, "410000.00");
    // Vendedor: recibe COP menos su 0,5%.
    assert.equal(calc.seller_fee, "2050.00");
    assert.equal(calc.seller_receives, "407950.00");
    // Comprador: recibe USD menos su 0,5%.
    assert.equal(calc.buyer_fee, "0.50");
    assert.equal(calc.buyer_receives, "99.50");
    assert.equal(calc.deviation_percent, 2.5);
    assert.equal(calc.min_rate, 3600);
    assert.equal(calc.max_rate, 4400);
  });

  it("rechaza una tasa a más de ±10% del mercado", () => {
    assert.equal(errorCode(() => calculateOffer({ ...base, rate: 4401 })), "RATE_OUT_OF_RANGE");
    assert.equal(errorCode(() => calculateOffer({ ...base, rate: 3599 })), "RATE_OUT_OF_RANGE");
    assert.doesNotThrow(() => calculateOffer({ ...base, rate: 4400 }));
    assert.doesNotThrow(() => calculateOffer({ ...base, rate: 3600 }));
  });

  it("rechaza montos con más decimales de los que admite la moneda", () => {
    assert.equal(errorCode(() => calculateOffer({ ...base, sellAmount: 10.123 })), "INVALID_AMOUNT");
  });

  it("rechaza montos tan chicos que alguna parte no recibiría nada", () => {
    // 0,01 COP a 0,00025 USD = 0 centavos de dólar.
    const tiny = { ...base, sellAmount: 0.01, rate: 0.00025, marketRate: 0.00025 };
    assert.equal(errorCode(() => calculateOffer(tiny)), "AMOUNT_TOO_SMALL");
  });

  it("sin comisión, cada parte recibe el monto completo", () => {
    const calc = calculateOffer({ ...base, feePercent: 0 });
    assert.equal(calc.seller_receives, calc.buy_amount);
    assert.equal(calc.buyer_receives, calc.sell_amount);
  });
});

describe("P2P: validación", () => {
  it("normaliza monedas y montos de la oferta", () => {
    const offer = parseOfferQuery({ sell_currency: "usd", buy_currency: "cop", sell_amount: "100", rate: "4000" });
    assert.deepEqual(offer, { sell_currency: "USD", buy_currency: "COP", sell_amount: 100, rate: 4000 });
  });

  it("rechaza la misma moneda, montos o tasas no positivos y campos de más", () => {
    const invalid = [
      { sell_currency: "USD", buy_currency: "USD", sell_amount: 1, rate: 1 },
      { sell_currency: "USD", buy_currency: "COP", sell_amount: 0, rate: 4000 },
      { sell_currency: "USD", buy_currency: "COP", sell_amount: 1, rate: -1 },
      // La wallet nunca la manda el cliente: sale del token.
      { sell_currency: "USD", buy_currency: "COP", sell_amount: 1, rate: 4000, wallet_id: "x" },
    ];
    for (const body of invalid) {
      assert.equal(errorCode(() => parseOfferBody(body)), "INVALID_P2P_PAYLOAD");
    }
  });

  it("para publicar la tasa es obligatoria; para simular es opcional (usa la del mercado)", () => {
    const withoutRate = { sell_currency: "USD", buy_currency: "COP", sell_amount: 100 };
    assert.equal(errorCode(() => parseOfferBody(withoutRate)), "INVALID_P2P_PAYLOAD");
    assert.deepEqual(parseOfferQuery(withoutRate), withoutRate);
  });

  it("los filtros del mercado son opcionales", () => {
    assert.deepEqual(parseMarketFilters({}), {});
    assert.deepEqual(parseMarketFilters({ sell_currency: "ars" }), { sell_currency: "ARS" });
  });

  it("los montos de los avisos van con 2 decimales como máximo", () => {
    assert.equal(formatMoney("338300.00000000", "COP"), "338.300,00 COP");
    assert.equal(formatMoney("0.75000000", "USD"), "0,75 USD");
    assert.equal(formatMoney("150.03", "USD"), "150,03 USD");
  });

  it("en el mercado se ve solo el nombre y la inicial del apellido", () => {
    assert.equal(publicName("Ana Pérez Gómez"), "Ana P.");
    assert.equal(publicName("  Alejo "), "Alejo");
  });
});

describe("P2P: emails", () => {
  const base = {
    user: { id: "u1", email: "ana@nexpay.com", full_name: "Ana Pérez" },
    offer_id: "11111111-1111-4111-8111-111111111111",
    sell_currency: "USD",
    buy_currency: "COP",
    sell_amount: "100.00",
    buy_amount: "410000.00",
    rate: 4100,
    fee_percent: 0.5,
    created_at: "2026-10-03T15:00:00.000Z",
  };

  it("vendida: dice cuánto recibió, la comisión y quién aceptó (solo nombre e inicial, sin HTML)", () => {
    const email = buildP2PEmail({
      ...base,
      event: "sold",
      fee_amount: "2050.00",
      fee_currency: "COP",
      receives: "407950.00",
      counterpart_name: "<b>Leo</b> M.",
      transaction_id: "tx-1",
    });
    assert.match(email.subject, /Vendiste 100\.00 USD/);
    assert.match(email.html, /\+407950\.00 COP/);
    assert.match(email.html, /2050\.00 COP \(0\.5%\)/);
    // El nombre lo escribe el usuario: en el HTML va escapado.
    assert.match(email.html, /&lt;b&gt;Leo&lt;\/b&gt; M\./);
    assert.doesNotMatch(email.html, /<b>Leo<\/b>/);
    assert.match(email.text, /<b>Leo<\/b> M\. aceptó tu oferta/);
    assert.doesNotMatch(email.text, /<strong>/);
  });

  it("publicada, cancelada y vencida: hablan del dinero retenido", () => {
    const published = buildP2PEmail({ ...base, event: "published", seller_receives: "407950.00", expires_at: "2026-10-06T15:00:00.000Z" });
    assert.match(published.html, /retenidos en garantía/);
    assert.match(published.html, /Recibes si aceptan/);
    for (const event of ["cancelled", "expired"] as const) {
      const email = buildP2PEmail({ ...base, event });
      assert.match(email.html, /volvieron a tu saldo/);
      assert.match(email.html, /\+100\.00 USD/);
    }
  });
});
