import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { PoolClient } from "pg";
import { superuserRepository, type ManagedUserRecord } from "../../src/modules/superuser/superuser.repository";
import { superuserService } from "../../src/modules/superuser/superuser.service";
import { pool } from "../../src/config/db";
import { env } from "../../src/config/env";
import { settingsService } from "../../src/modules/settings/settings.service";
import { parseFeesBody, parseUsersQuery } from "../../src/modules/superuser/superuser.middlewares";
import { treasuryRepository } from "../../src/modules/treasury/treasury.repository";
import { walletsRepository } from "../../src/modules/wallets/wallets.repository";
import { AppError } from "../../src/utils/app-error";

const user = (overrides: Partial<ManagedUserRecord> = {}): ManagedUserRecord => ({
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Ana Pérez",
  email: "ana@nexpay.com",
  role: "user",
  is_owner: false,
  status: "active",
  created_at: new Date("2026-10-01T10:00:00.000Z"),
  ...overrides,
});

const ACTOR = "11111111-1111-4111-8111-111111111111";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return "SIN_ERROR";
}

afterEach(() => mock.restoreAll());

describe("Superusuario: roles y suspensión", () => {
  it("asigna superusuario a un usuario común", async () => {
    mock.method(superuserRepository, "findUser", async () => user());
    const setRole = mock.method(superuserRepository, "setRole", async () => user({ role: "superuser" }));
    const result = await superuserService.setRole(ACTOR, user().id, "superuser");
    assert.equal(result.role, "superuser");
    assert.deepEqual(setRole.mock.calls[0]?.arguments, [user().id, "superuser"]);
  });

  it("no toca la cuenta propietaria ni la propia", async () => {
    mock.method(superuserRepository, "findUser", async () => user({ is_owner: true, role: "superuser" }));
    assert.equal(await errorCode(superuserService.setRole(ACTOR, user().id, "user")), "OWNER_PROTECTED");
    assert.equal(await errorCode(superuserService.setStatus(ACTOR, user().id, "suspended")), "OWNER_PROTECTED");

    mock.restoreAll();
    mock.method(superuserRepository, "findUser", async () => user({ id: ACTOR, role: "superuser" }));
    assert.equal(await errorCode(superuserService.setStatus(ACTOR, ACTOR, "suspended")), "CANNOT_CHANGE_SELF");
  });

  it("si el usuario no existe responde 404", async () => {
    mock.method(superuserRepository, "findUser", async () => null);
    assert.equal(await errorCode(superuserService.setStatus(ACTOR, user().id, "suspended")), "USER_NOT_FOUND");
  });

  it("valida la búsqueda por correo y la paginación", () => {
    assert.deepEqual(parseUsersQuery({ email: " ana " }), { email: "ana", page: 1, limit: 20 });
    assert.throws(() => parseUsersQuery({ limit: "500" }), AppError);
    assert.throws(() => parseUsersQuery({ role: "admin" }), AppError);
  });
});

describe("Tesorería: comisiones a la cuenta propietaria", () => {
  /** Cliente SQL de mentira que guarda cada INSERT en platform_fees. */
  function fakeClient() {
    const inserts: unknown[][] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("INSERT INTO platform_fees")) inserts.push(params);
        return { rows: [], rowCount: 1 };
      },
    } as unknown as PoolClient;
    return { client, inserts };
  }

  it("acredita cada comisión en su moneda exacta, ordenadas por moneda, y omite las de 0", async () => {
    mock.method(treasuryRepository, "findOwnerWalletId", async () => "owner-wallet");
    const credit = mock.method(walletsRepository, "creditBalance", async () => "0");
    const { client, inserts } = fakeClient();

    await treasuryRepository.collect(client, [
      { source: "p2p", currency: "USD", amount: "0.50", payer_wallet_id: "b", transaction_id: "t2" },
      { source: "p2p", currency: "COP", amount: "2050.00", payer_wallet_id: "s", transaction_id: "t1" },
      { source: "exchange", currency: "EUR", amount: "0", payer_wallet_id: "x", transaction_id: "t3" },
    ]);

    assert.deepEqual(
      credit.mock.calls.map((call) => call.arguments.slice(1)),
      [
        ["owner-wallet", "COP", "2050.00"],
        ["owner-wallet", "USD", "0.50"],
      ],
    );
    assert.equal(inserts.length, 2);
    assert.equal(inserts[0]?.[6], "owner-wallet");
  });

  it("sin cuenta propietaria registra la comisión pero no la acredita", async () => {
    mock.method(treasuryRepository, "findOwnerWalletId", async () => null);
    const credit = mock.method(walletsRepository, "creditBalance", async () => "0");
    const { client, inserts } = fakeClient();

    await treasuryRepository.collect(client, [
      { source: "exchange", currency: "COP", amount: "100.00", payer_wallet_id: "x", transaction_id: "t" },
    ]);

    assert.equal(credit.mock.callCount(), 0);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0]?.[6], null);
  });
});

describe("Comisiones configurables", () => {
  it("acepta de 0 a 10 % con hasta 4 decimales, y al menos una comisión", () => {
    assert.deepEqual(parseFeesBody({ exchange_fee_percent: 0.05 }), { exchange_fee_percent: 0.05 });
    assert.deepEqual(parseFeesBody({ p2p_fee_percent: 0 }), { p2p_fee_percent: 0 });
    for (const body of [{}, { exchange_fee_percent: -1 }, { exchange_fee_percent: 11 }, { p2p_fee_percent: 0.12345 }, { otra: 1 }]) {
      assert.throws(() => parseFeesBody(body), AppError);
    }
  });

  it("si la base no responde, las operaciones usan las comisiones de las variables de entorno", async () => {
    settingsService.clearCache();
    mock.method(pool, "query", async () => {
      throw new Error("sin conexión");
    });
    const fees = await settingsService.getFees();
    assert.deepEqual(fees, { exchange_fee_percent: env.EXCHANGE_FEE_PERCENT, p2p_fee_percent: env.P2P_FEE_PERCENT });
  });
});
