import { pool, type Queryable } from "../config/db";

export interface CurrencyRow {
  code: string;
  name: string;
  decimals: number;
}

export async function findActiveCurrencies(db: Queryable = pool): Promise<CurrencyRow[]> {
  const { rows } = await db.query<CurrencyRow>(
    "SELECT code, name, decimals FROM currencies WHERE is_active = TRUE ORDER BY code",
  );
  return rows;
}
