import { AppError } from "../../utils/app-error";
import type { UserRole } from "../auth/auth.types";
import { treasuryRepository, type FeeTotalRecord } from "../treasury/treasury.repository";
import { walletsRepository } from "../wallets/wallets.repository";
import { superuserRepository, type ManagedUserRecord, type Page, type SystemOfferRecord, type SystemTransactionRecord } from "./superuser.repository";

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_owner: boolean;
  status: ManagedUserRecord["status"];
  created_at: string;
}

export interface FeesSummary {
  /** Total cobrado por moneda, separado por origen. */
  totals: FeeTotalRecord[];
  /** Saldo actual de la billetera propietaria (comisiones más lo que haya movido). */
  owner_balances: { currency: string; amount: string }[];
  /** false si todavía no se creó la cuenta propietaria: las comisiones se registran pero no se acreditan. */
  owner_exists: boolean;
}

const toPage = <R, T>(page: Page<R>, query: { page: number; limit: number }, map: (row: R) => T): PageResult<T> => ({
  items: page.rows.map(map),
  page: query.page,
  limit: query.limit,
  total: page.total,
});

const offset = (query: { page: number; limit: number }) => (query.page - 1) * query.limit;

function toManagedUser(user: ManagedUserRecord): ManagedUser {
  return { ...user, created_at: user.created_at.toISOString() };
}

/** No se cambia el rol ni el estado de la cuenta propietaria, ni los de uno mismo (para no quedarse afuera). */
async function assertManageable(actorId: string, targetId: string): Promise<ManagedUserRecord> {
  const target = await superuserRepository.findUser(targetId);
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
  if (target.is_owner) {
    throw new AppError(409, "OWNER_PROTECTED", "La cuenta propietaria de NexPay siempre es superusuario y no se puede suspender");
  }
  if (target.id === actorId) {
    throw new AppError(409, "CANNOT_CHANGE_SELF", "No puedes cambiar tu propio rol ni suspender tu propia cuenta");
  }
  return target;
}

export const superuserService = {
  async listUsers(query: { email?: string; page: number; limit: number }): Promise<PageResult<ManagedUser>> {
    const page = await superuserRepository.searchUsers({ email: query.email, limit: query.limit, offset: offset(query) });
    return toPage(page, query, toManagedUser);
  },

  async setRole(actorId: string, targetId: string, role: UserRole): Promise<ManagedUser> {
    await assertManageable(actorId, targetId);
    const updated = await superuserRepository.setRole(targetId, role);
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    return toManagedUser(updated);
  },

  async setStatus(actorId: string, targetId: string, status: "active" | "suspended"): Promise<ManagedUser> {
    await assertManageable(actorId, targetId);
    const updated = await superuserRepository.setStatus(targetId, status);
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    return toManagedUser(updated);
  },

  /** Comisiones cobradas por moneda y origen, y el saldo de la billetera propietaria. */
  async feesSummary(): Promise<FeesSummary> {
    const [rows, ownerWalletId] = await Promise.all([treasuryRepository.totals(), treasuryRepository.findOwnerWalletId()]);

    const balances = ownerWalletId ? await walletsRepository.findBalancesWithCurrency(ownerWalletId) : [];
    return {
      totals: rows,
      owner_balances: balances.map((b) => ({ currency: b.currency_code, amount: b.amount })),
      owner_exists: ownerWalletId !== null,
    };
  },

  async listFees(query: { page: number; limit: number }) {
    const { rows, total } = await treasuryRepository.list(query.limit, offset(query));
    return toPage({ rows, total }, query, (fee) => ({ ...fee, created_at: fee.created_at.toISOString() }));
  },

  async listTransactions(query: { type?: "DEPOSIT" | "EXCHANGE" | "P2P"; email?: string; page: number; limit: number }) {
    const types: SystemTransactionRecord["type"][] | undefined =
      query.type === "EXCHANGE" ? ["BUY", "SELL", "EXCHANGE"] : query.type ? [query.type] : undefined;
    const page = await superuserRepository.listTransactions({ types, email: query.email, limit: query.limit, offset: offset(query) });
    return toPage(page, query, (tx) => ({ ...tx, exchange_rate: Number(tx.exchange_rate), created_at: tx.created_at.toISOString() }));
  },

  async listOffers(query: { status?: SystemOfferRecord["status"]; page: number; limit: number }) {
    const page = await superuserRepository.listOffers({ status: query.status, limit: query.limit, offset: offset(query) });
    return toPage(page, query, (offer) => ({
      ...offer,
      rate: Number(offer.rate),
      created_at: offer.created_at.toISOString(),
      expires_at: offer.expires_at.toISOString(),
      closed_at: offer.closed_at ? offer.closed_at.toISOString() : null,
    }));
  },
};

