import { pool } from "../../config/db";
import type { UserRole, UserStatus } from "../auth/auth.types";
import type { TransactionType } from "../transactions/transactions.repository";

export interface ManagedUserRecord {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_owner: boolean;
  status: UserStatus;
  created_at: Date;
}

export interface SystemTransactionRecord {
  id: string;
  type: TransactionType;
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
  fee_amount: string;
  fee_currency: string | null;
  created_at: Date;
  user_email: string;
  user_name: string;
}

export interface SystemOfferRecord {
  id: string;
  status: "open" | "completed" | "cancelled" | "expired";
  sell_currency: string;
  buy_currency: string;
  sell_amount: string;
  buy_amount: string;
  rate: string;
  seller_fee: string;
  buyer_fee: string;
  seller_email: string;
  seller_name: string;
  buyer_email: string | null;
  buyer_name: string | null;
  created_at: Date;
  expires_at: Date;
  closed_at: Date | null;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

const USER_COLUMNS = "id, full_name, email, role, is_owner, status, created_at";

/** `%texto%` para ILIKE, escapando los comodines que escriba el usuario. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export const superuserRepository = {
  /** Usuarios registrados (no borrados), opcionalmente buscados por correo. */
  async searchUsers(filters: { email?: string; limit: number; offset: number }): Promise<Page<ManagedUserRecord>> {
    const pattern = filters.email ? likePattern(filters.email) : null;
    const [list, count] = await Promise.all([
      pool.query<ManagedUserRecord>(
        `SELECT ${USER_COLUMNS} FROM users
         WHERE deleted_at IS NULL AND ($1::text IS NULL OR email ILIKE $1)
         ORDER BY is_owner DESC, role DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [pattern, filters.limit, filters.offset],
      ),
      pool.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM users WHERE deleted_at IS NULL AND ($1::text IS NULL OR email ILIKE $1)",
        [pattern],
      ),
    ]);
    return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
  },

  async findUser(id: string): Promise<ManagedUserRecord | null> {
    const { rows } = await pool.query<ManagedUserRecord>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** Cambia el rol. Nunca a la cuenta propietaria (siempre es superusuario). */
  async setRole(id: string, role: UserRole): Promise<ManagedUserRecord | null> {
    const { rows } = await pool.query<ManagedUserRecord>(
      `UPDATE users SET role = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL AND NOT is_owner
       RETURNING ${USER_COLUMNS}`,
      [id, role],
    );
    return rows[0] ?? null;
  },

  /**
   * Suspende o reactiva una cuenta. Al suspender sube session_version: todas sus sesiones abiertas
   * dejan de valer al instante. Nunca a la cuenta propietaria.
   */
  async setStatus(id: string, status: "active" | "suspended"): Promise<ManagedUserRecord | null> {
    const { rows } = await pool.query<ManagedUserRecord>(
      `UPDATE users
       SET status = $2,
           session_version = session_version + CASE WHEN $2 = 'suspended' THEN 1 ELSE 0 END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL AND NOT is_owner
       RETURNING ${USER_COLUMNS}`,
      [id, status],
    );
    return rows[0] ?? null;
  },

  /** Todas las transacciones del sistema, con su dueño, opcionalmente por tipo y correo. */
  async listTransactions(filters: { types?: TransactionType[]; email?: string; limit: number; offset: number }): Promise<Page<SystemTransactionRecord>> {
    const pattern = filters.email ? likePattern(filters.email) : null;
    const where = `($1::varchar[] IS NULL OR t.type = ANY($1)) AND ($2::text IS NULL OR u.email ILIKE $2)`;
    const [list, count] = await Promise.all([
      pool.query<SystemTransactionRecord>(
        `SELECT t.id, t.type, t.from_currency, t.to_currency, t.from_amount::text AS from_amount,
                t.to_amount::text AS to_amount, t.exchange_rate::text AS exchange_rate,
                t.fee_amount::text AS fee_amount, t.fee_currency, t.created_at,
                u.email AS user_email, u.full_name AS user_name
         FROM transactions t
         JOIN wallets w ON w.id = t.wallet_id
         JOIN users u ON u.id = w.user_id
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $3 OFFSET $4`,
        [filters.types ?? null, pattern, filters.limit, filters.offset],
      ),
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS total
         FROM transactions t JOIN wallets w ON w.id = t.wallet_id JOIN users u ON u.id = w.user_id
         WHERE ${where}`,
        [filters.types ?? null, pattern],
      ),
    ]);
    return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
  },

  /** Todas las ofertas P2P del sistema, con vendedor y comprador, opcionalmente por estado. */
  async listOffers(filters: { status?: SystemOfferRecord["status"]; limit: number; offset: number }): Promise<Page<SystemOfferRecord>> {
    const [list, count] = await Promise.all([
      pool.query<SystemOfferRecord>(
        `SELECT o.id, o.status, o.sell_currency, o.buy_currency, o.sell_amount::text AS sell_amount,
                o.buy_amount::text AS buy_amount, o.rate::text AS rate,
                o.seller_fee::text AS seller_fee, o.buyer_fee::text AS buyer_fee,
                su.email AS seller_email, su.full_name AS seller_name,
                bu.email AS buyer_email, bu.full_name AS buyer_name,
                o.created_at, o.expires_at, o.closed_at
         FROM p2p_offers o
         JOIN wallets sw ON sw.id = o.seller_wallet_id JOIN users su ON su.id = sw.user_id
         LEFT JOIN wallets bw ON bw.id = o.buyer_wallet_id LEFT JOIN users bu ON bu.id = bw.user_id
         WHERE ($1::varchar IS NULL OR o.status = $1)
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [filters.status ?? null, filters.limit, filters.offset],
      ),
      pool.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM p2p_offers WHERE ($1::varchar IS NULL OR status = $1)",
        [filters.status ?? null],
      ),
    ]);
    return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
  },
};
