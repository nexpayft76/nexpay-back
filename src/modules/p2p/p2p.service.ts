import { withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";
import { logger } from "../../utils/logger";
import { alertsService } from "../alerts/alerts.service";
import { notificationsService, type P2PEmailData } from "../notifications";
import { notificationsRepository } from "../notifications/notifications.repository";
import { assertSupported, getRateSnapshot, quoteRate } from "../rates/rates.service";
import { usersRepository } from "../users/users.repository";
import { walletsRepository } from "../wallets/wallets.repository";
import { calculateOffer, formatMoney, publicName, type P2PCalc } from "./p2p.calc";
import { p2pRepository, type P2PMarketRecord, type P2POfferRecord } from "./p2p.repository";

export interface P2POfferInput {
  sell_currency: string;
  buy_currency: string;
  sell_amount: number;
  rate: number;
}

/** Simulación: sin tasa, se usa la del mercado. */
export type P2PQuoteInput = Omit<P2POfferInput, "rate"> & { rate?: number };

export interface P2PQuote extends P2PCalc {
  sell_currency: string;
  buy_currency: string;
  /** Si participa ARS, la tasa de mercado usa el dólar MEP. */
  market_reference: string;
  rates_date: string;
  warnings: string[];
}

/** Oferta como la ve su dueño. */
export interface P2POfferView {
  id: string;
  status: P2POfferRecord["status"];
  sell_currency: string;
  buy_currency: string;
  sell_amount: string;
  rate: number;
  market_rate: number;
  buy_amount: string;
  fee_percent: number;
  seller_fee: string;
  seller_receives: string;
  buyer_fee: string;
  buyer_receives: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
}

/** Oferta como la ve un posible comprador en el mercado. */
export interface P2PMarketOffer extends P2POfferView {
  seller_name: string;
  /** Reputación: intercambios P2P completados por el vendedor. */
  completed_trades: number;
}

function toView(offer: P2POfferRecord): P2POfferView {
  return {
    id: offer.id,
    status: offer.status,
    sell_currency: offer.sell_currency,
    buy_currency: offer.buy_currency,
    sell_amount: offer.sell_amount,
    rate: Number(offer.rate),
    market_rate: Number(offer.market_rate),
    buy_amount: offer.buy_amount,
    fee_percent: Number(offer.fee_percent),
    seller_fee: offer.seller_fee,
    seller_receives: offer.seller_receives,
    buyer_fee: offer.buyer_fee,
    buyer_receives: offer.buyer_receives,
    created_at: offer.created_at.toISOString(),
    expires_at: offer.expires_at.toISOString(),
    closed_at: offer.closed_at ? offer.closed_at.toISOString() : null,
  };
}

function toMarketView(offer: P2PMarketRecord): P2PMarketOffer {
  return { ...toView(offer), seller_name: publicName(offer.seller_name), completed_trades: Number(offer.completed_trades) };
}

async function requireWallet(userId: string): Promise<string> {
  const wallet = await walletsRepository.findByUserId(userId);
  if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");
  return wallet.id;
}

/** Calcula la oferta con la tasa del mercado de ahora (la del servidor, nunca una del cliente). */
async function buildQuote(input: P2PQuoteInput): Promise<P2PQuote> {
  const snapshot = await getRateSnapshot();
  const sell = assertSupported(snapshot.currencies, input.sell_currency);
  const buy = assertSupported(snapshot.currencies, input.buy_currency);
  for (const code of [sell.code, buy.code]) {
    if (snapshot.unavailable.includes(code)) {
      throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${code} no está disponible en este momento`);
    }
  }

  const { rate: marketRate, ars_rate } = quoteRate(snapshot, sell.code, buy.code, "mep");
  const calc = calculateOffer({
    sellAmount: input.sell_amount,
    sellDecimals: sell.decimals,
    buyDecimals: buy.decimals,
    rate: input.rate ?? marketRate,
    marketRate,
    feePercent: env.P2P_FEE_PERCENT,
    maxDeviationPercent: env.P2P_MAX_RATE_DEVIATION_PERCENT,
  });

  return {
    ...calc,
    sell_currency: sell.code,
    buy_currency: buy.code,
    market_reference: ars_rate ? `dólar ${ars_rate.label}` : "tasa oficial del día",
    rates_date: snapshot.table.date,
    warnings: snapshot.warnings,
  };
}

type P2PEmailDetails = Omit<P2PEmailData, "user">;

/** Email P2P (AWS SES, mismo registro que los demás correos). En segundo plano: nunca frena ni rompe la operación. */
function emailUser(userId: string, details: P2PEmailDetails): void {
  void usersRepository
    .findById(userId)
    .then((user) => {
      if (user) {
        return notificationsService.sendP2PEmail({ ...details, user: { id: user.id, email: user.email, full_name: user.full_name } });
      }
      return undefined;
    })
    .catch((error: unknown) => logger.warn("No se pudo enviar el email P2P", { error: String(error), event: details.event }));
}

/** Datos de la oferta que van en todos los emails P2P. */
function emailBase(offer: P2POfferRecord): Omit<P2PEmailDetails, "event"> {
  return {
    offer_id: offer.id,
    sell_currency: offer.sell_currency,
    buy_currency: offer.buy_currency,
    sell_amount: offer.sell_amount,
    buy_amount: offer.buy_amount,
    rate: Number(offer.rate),
    fee_percent: Number(offer.fee_percent),
    created_at: (offer.closed_at ?? offer.created_at).toISOString(),
  };
}

/** Devuelve lo retenido de las ofertas vencidas y avisa a cada vendedor. Nunca rompe la operación que la llama. */
async function releaseExpiredOffers(): Promise<void> {
  try {
    const released = await withTransaction((client) => p2pRepository.releaseExpired(client));
    for (const offer of released) {
      void notificationsRepository
        .create(offer.seller_user_id, {
          type: "system",
          title: "Tu oferta P2P venció",
          message: `Nadie aceptó tu oferta a tiempo: los ${formatMoney(offer.sell_amount, offer.sell_currency)} retenidos volvieron a tu saldo.`,
        })
        .catch(() => undefined);
      emailUser(offer.seller_user_id, {
        event: "expired",
        offer_id: offer.id,
        sell_currency: offer.sell_currency,
        buy_currency: offer.buy_currency,
        sell_amount: offer.sell_amount,
        buy_amount: offer.buy_amount,
        rate: Number(offer.rate),
        fee_percent: Number(offer.fee_percent),
        created_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.warn("No se pudieron cerrar las ofertas P2P vencidas", { error: String(error) });
  }
}

export const p2pService = {
  /** Lo que pasaría si publica esta oferta: tasa actual, límites, comisión y lo que recibe cada uno. */
  quote: (input: P2PQuoteInput): Promise<P2PQuote> => buildQuote(input),

  /** Publica una oferta y retiene el monto en garantía. */
  async createOffer(userId: string, input: P2POfferInput): Promise<{ offer: P2POfferView; quote: P2PQuote; balance: string }> {
    const walletId = await requireWallet(userId);
    const quote = await buildQuote(input);
    const result = await withTransaction((client) =>
      p2pRepository.createOffer(client, {
        wallet_id: walletId,
        sell_currency: quote.sell_currency,
        buy_currency: quote.buy_currency,
        calc: quote,
        ttl_hours: env.P2P_OFFER_TTL_HOURS,
        max_open: env.P2P_MAX_OPEN_OFFERS,
      }),
    );
    void alertsService.onBalancesChanged(userId, [{ currency: quote.sell_currency, amount: result.balance }], result.offer.id);
    emailUser(userId, {
      ...emailBase(result.offer),
      event: "published",
      seller_receives: result.offer.seller_receives,
      expires_at: result.offer.expires_at.toISOString(),
    });
    return { offer: toView(result.offer), quote, balance: result.balance };
  },

  /** Mercado: ofertas abiertas de otros usuarios. */
  async listMarket(userId: string, filters: { sell_currency?: string; buy_currency?: string }): Promise<P2PMarketOffer[]> {
    const walletId = await requireWallet(userId);
    await releaseExpiredOffers();
    const offers = await p2pRepository.listOpen({ exclude_wallet_id: walletId, ...filters, limit: 50 });
    return offers.map(toMarketView);
  },

  /** Ofertas propias (abiertas y cerradas). */
  async listMine(userId: string): Promise<P2POfferView[]> {
    const walletId = await requireWallet(userId);
    await releaseExpiredOffers();
    return (await p2pRepository.listBySeller(walletId)).map(toView);
  },

  /** Acepta una oferta: el cambio se hace al instante para los dos. */
  async acceptOffer(userId: string, offerId: string): Promise<{ offer: P2POfferView; balances: { paid: string; received: string } }> {
    const walletId = await requireWallet(userId);
    const result = await withTransaction((client) => p2pRepository.acceptOffer(client, { offer_id: offerId, buyer_wallet_id: walletId }));
    const { offer } = result;

    void alertsService.onBalancesChanged(userId, [
      { currency: offer.buy_currency, amount: result.buyer_balances.paid },
      { currency: offer.sell_currency, amount: result.buyer_balances.received },
    ], offer.buyer_tx_id ?? offer.id);
    if (result.seller_user_id) {
      void alertsService.onBalancesChanged(result.seller_user_id, [
        { currency: offer.buy_currency, amount: result.seller_balance },
      ], offer.seller_tx_id ?? offer.id);
      void notificationsRepository
        .create(result.seller_user_id, {
          type: "system",
          title: "¡Aceptaron tu oferta P2P!",
          message: `Vendiste ${formatMoney(offer.sell_amount, offer.sell_currency)} y recibiste ${formatMoney(offer.seller_receives, offer.buy_currency)} (comisión ${formatMoney(offer.seller_fee, offer.buy_currency)}).`,
        })
        .catch(() => undefined);
    }

    // Comprobante por email a las dos partes, en segundo plano; cada uno ve a la otra solo con nombre e inicial.
    void Promise.all([
      usersRepository.findById(userId).catch(() => null),
      result.seller_user_id ? usersRepository.findById(result.seller_user_id).catch(() => null) : Promise.resolve(null),
    ]).then(([buyer, seller]) => {
      emailUser(userId, {
        ...emailBase(offer),
        event: "bought",
        fee_amount: offer.buyer_fee,
        fee_currency: offer.sell_currency,
        receives: offer.buyer_receives,
        counterpart_name: seller ? publicName(seller.full_name) : undefined,
        transaction_id: offer.buyer_tx_id,
      });
      if (result.seller_user_id) {
        emailUser(result.seller_user_id, {
          ...emailBase(offer),
          event: "sold",
          fee_amount: offer.seller_fee,
          fee_currency: offer.buy_currency,
          receives: offer.seller_receives,
          counterpart_name: buyer ? publicName(buyer.full_name) : undefined,
          transaction_id: offer.seller_tx_id,
        });
      }
    });

    return { offer: toView(offer), balances: result.buyer_balances };
  },

  /** Cancela una oferta propia abierta y devuelve lo retenido. */
  async cancelOffer(userId: string, offerId: string): Promise<{ offer: P2POfferView; balance: string }> {
    const walletId = await requireWallet(userId);
    const result = await withTransaction((client) => p2pRepository.cancelOffer(client, { offer_id: offerId, seller_wallet_id: walletId }));
    void alertsService.onBalancesChanged(userId, [{ currency: result.offer.sell_currency, amount: result.balance }], result.offer.id);
    emailUser(userId, { ...emailBase(result.offer), event: "cancelled" });
    return { offer: toView(result.offer), balance: result.balance };
  },
};
