import { AppError } from "../../utils/app-error";
import { roundSignificant } from "../../utils/money";

/** Datos para calcular una oferta P2P. Las tasas son unidades de `buy` por 1 de `sell`. */
export interface P2PCalcInput {
  sellAmount: number;
  sellDecimals: number;
  buyDecimals: number;
  /** Tasa elegida por el vendedor. */
  rate: number;
  /** Tasa del mercado en este momento. */
  marketRate: number;
  /** Comisión de cada parte, en % de lo que recibe. */
  feePercent: number;
  /** Desvío máximo permitido respecto del mercado, en %. */
  maxDeviationPercent: number;
}

/** Montos de una oferta, como texto exacto (con los decimales de cada moneda). */
export interface P2PCalc {
  sell_amount: string;
  rate: number;
  market_rate: number;
  /** Cuánto se aleja la tasa del mercado, en % (positivo = más cara para el comprador). */
  deviation_percent: number;
  min_rate: number;
  max_rate: number;
  fee_percent: number;
  /** Lo que paga el comprador (moneda que compra el vendedor). */
  buy_amount: string;
  /** Comisión del vendedor, en la moneda que recibe. */
  seller_fee: string;
  seller_receives: string;
  /** Comisión del comprador, en la moneda que recibe. */
  buyer_fee: string;
  buyer_receives: string;
}

/**
 * Calcula una oferta P2P en unidades mínimas (centavos), para que comisión y neto cuadren exacto.
 * Rechaza montos con más decimales de los que admite la moneda y tasas fuera del rango permitido.
 */
export function calculateOffer(input: P2PCalcInput): P2PCalc {
  const sellScale = 10 ** input.sellDecimals;
  const buyScale = 10 ** input.buyDecimals;

  const sellMinor = Math.round(input.sellAmount * sellScale);
  if (Math.abs(input.sellAmount * sellScale - sellMinor) > 1e-6) {
    throw new AppError(400, "INVALID_AMOUNT", `El monto admite como máximo ${input.sellDecimals} decimales`);
  }
  if (sellMinor <= 0) throw new AppError(400, "INVALID_AMOUNT", "El monto debe ser mayor que 0");

  const rate = roundSignificant(input.rate, 10);
  const marketRate = roundSignificant(input.marketRate, 10);
  const minRate = roundSignificant(marketRate * (1 - input.maxDeviationPercent / 100), 10);
  const maxRate = roundSignificant(marketRate * (1 + input.maxDeviationPercent / 100), 10);
  if (rate < minRate || rate > maxRate) {
    throw new AppError(
      400,
      "RATE_OUT_OF_RANGE",
      `La tasa debe estar entre ${minRate} y ${maxRate} (±${input.maxDeviationPercent}% de la tasa actual, ${marketRate})`,
      { min_rate: minRate, max_rate: maxRate, market_rate: marketRate },
    );
  }

  const buyMinor = Math.round((sellMinor / sellScale) * rate * buyScale);
  const sellerFeeMinor = Math.round((buyMinor * input.feePercent) / 100);
  const buyerFeeMinor = Math.round((sellMinor * input.feePercent) / 100);
  if (buyMinor - sellerFeeMinor <= 0 || sellMinor - buyerFeeMinor <= 0) {
    throw new AppError(400, "AMOUNT_TOO_SMALL", "El monto es demasiado chico para publicarlo");
  }

  const sell = (minor: number) => (minor / sellScale).toFixed(input.sellDecimals);
  const buy = (minor: number) => (minor / buyScale).toFixed(input.buyDecimals);

  return {
    sell_amount: sell(sellMinor),
    rate,
    market_rate: marketRate,
    deviation_percent: Math.round((rate / marketRate - 1) * 10_000) / 100,
    min_rate: minRate,
    max_rate: maxRate,
    fee_percent: input.feePercent,
    buy_amount: buy(buyMinor),
    seller_fee: buy(sellerFeeMinor),
    seller_receives: buy(buyMinor - sellerFeeMinor),
    buyer_fee: sell(buyerFeeMinor),
    buyer_receives: sell(sellMinor - buyerFeeMinor),
  };
}

/** "Ana Pérez Gómez" → "Ana P.": en el mercado no se muestra el nombre completo de nadie. */
export function publicName(fullName: string): string {
  const [first = "Usuario", second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second.charAt(0).toUpperCase()}.` : first;
}

/** Monto para mostrar a una persona: máximo 2 decimales y formato local ("338.300,00 COP"). */
export function formatMoney(amount: string | number, currency: string): string {
  const value = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
  return `${value} ${currency}`;
}
