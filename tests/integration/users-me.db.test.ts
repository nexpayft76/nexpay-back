import "../helpers/test-env";
import assert from "node:assert/strict";
import { once } from "node:events";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { app } from "../../src/app";
import { pool } from "../../src/config/db";
import { authService } from "../../src/modules/auth/auth.service";

// Prueba de punta a punta contra una base PostgreSQL REAL (sin mocks): registro, edición y cierre de cuenta.
// Solo corre si se define TEST_DATABASE_URL (una base descartable con el schema y las migraciones aplicadas):
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/nexpay_test npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

const PASSWORD = "Secreta123";
const run = Date.now().toString(36);
let server: http.Server;
let baseUrl: string;

interface Account {
  id: string;
  email: string;
  token: string;
}

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Crea usuario + wallet + balances con la lógica real de registro (sin pasar por HTTP: /register limita a 5 por minuto). */
async function register(label: string): Promise<Account> {
  const email = `${label}-${run}@nexpay-test.com`;
  const result = await authService.register({ full_name: `Usuario ${label}`, email, password: PASSWORD });
  return { id: result.user.id, email, token: result.token };
}

async function dbUser(id: string) {
  const { rows } = await pool.query(`SELECT full_name, email, status, deleted_at, updated_at FROM users WHERE id = $1`, [id]);
  return rows[0];
}

/** Deja un saldo en una de las monedas de la billetera del usuario. */
async function setBalance(userId: string, currency: string, amount: number) {
  await pool.query(
    `UPDATE balances SET amount = $3
     WHERE currency_code = $2 AND wallet_id = (SELECT id FROM wallets WHERE user_id = $1)`,
    [userId, currency, amount],
  );
}

describe("Usuario /me contra PostgreSQL real", { skip: !enabled && "definir TEST_DATABASE_URL para correr estos tests" }, () => {
  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await pool.end();
  });

  it("edita nombre y email: se guardan (email en minúsculas) y /auth/me lo refleja", async () => {
    const ana = await register("ana");
    const before = await dbUser(ana.id);

    const res = await call("PATCH", "/api/users/me", ana.token, {
      full_name: "  Ana María Pérez ",
      email: `ANA-NUEVA-${run}@NexPay-Test.com`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.full_name, "Ana María Pérez");
    assert.equal(res.body.data.email, `ana-nueva-${run}@nexpay-test.com`);
    assert.equal("password_hash" in res.body.data, false);

    const me = await call("GET", "/api/auth/me", ana.token);
    assert.equal(me.body.data.full_name, "Ana María Pérez");
    assert.equal(me.body.data.email, `ana-nueva-${run}@nexpay-test.com`);
    assert.ok((await dbUser(ana.id)).updated_at > before.updated_at);
  });

  it("permite cambiar solo el nombre y dejar el email igual", async () => {
    const beto = await register("beto");
    const res = await call("PATCH", "/api/users/me", beto.token, { full_name: "Beto Nuevo" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, beto.email);
    assert.equal((await dbUser(beto.id)).email, beto.email);
  });

  it("permite 'cambiar' al mismo email que ya tiene (no choca consigo mismo)", async () => {
    const carla = await register("carla");
    const res = await call("PATCH", "/api/users/me", carla.token, { email: carla.email });
    assert.equal(res.status, 200);
  });

  it("responde 409 si el email ya lo usa otra cuenta y no cambia nada", async () => {
    const dani = await register("dani");
    const eva = await register("eva");

    const res = await call("PATCH", "/api/users/me", dani.token, { email: eva.email.toUpperCase() });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "EMAIL_ALREADY_REGISTERED");
    assert.equal((await dbUser(dani.id)).email, dani.email);
    assert.equal((await dbUser(eva.id)).email, eva.email);
  });

  it("no permite cambiar el estado desde /me", async () => {
    const fede = await register("fede");
    const res = await call("PATCH", "/api/users/me", fede.token, { status: "suspended" });
    assert.equal(res.status, 400);
    assert.equal((await dbUser(fede.id)).status, "active");
  });

  it("cerrar la cuenta: contraseña incorrecta no hace nada; con saldo no cierra; en 0 sí, y ya no se puede entrar", async () => {
    const gabi = await register("gabi");

    // 1) Contraseña incorrecta: 403 y la cuenta sigue activa.
    const wrong = await call("DELETE", "/api/users/me", gabi.token, { password: "Incorrecta1" });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error, "INVALID_PASSWORD");
    assert.equal((await dbUser(gabi.id)).status, "active");

    // 2) Con saldo: 409 y la cuenta sigue activa y con sesión.
    await setBalance(gabi.id, "USD", 25.5);
    const withBalance = await call("DELETE", "/api/users/me", gabi.token, { password: PASSWORD });
    assert.equal(withBalance.status, 409);
    assert.equal(withBalance.body.error, "ACCOUNT_HAS_BALANCE");
    const stillThere = await dbUser(gabi.id);
    assert.equal(stillThere.status, "active");
    assert.equal(stillThere.deleted_at, null);
    assert.equal((await call("GET", "/api/auth/me", gabi.token)).status, 200);

    // 3) Saldo en 0: se cierra (borrado lógico).
    await setBalance(gabi.id, "USD", 0);
    const closed = await call("DELETE", "/api/users/me", gabi.token, { password: PASSWORD });
    assert.equal(closed.status, 204);
    const row = await dbUser(gabi.id);
    assert.equal(row.status, "closed");
    assert.notEqual(row.deleted_at, null);

    // 4) Ya no puede usar el token ni iniciar sesión de nuevo.
    assert.equal((await call("GET", "/api/auth/me", gabi.token)).status, 401);
    const login = await call("POST", "/api/auth/login", null, { email: gabi.email, password: PASSWORD });
    assert.equal(login.status, 401);
    assert.equal(login.body.error, "INVALID_CREDENTIALS");
  });

  it("el saldo de otro usuario no impide cerrar la cuenta propia, y la otra cuenta no se toca", async () => {
    const hugo = await register("hugo");
    const ines = await register("ines");
    await setBalance(ines.id, "COP", 1000);

    const res = await call("DELETE", "/api/users/me", hugo.token, { password: PASSWORD });

    assert.equal(res.status, 204);
    assert.equal((await dbUser(hugo.id)).status, "closed");
    const other = await dbUser(ines.id);
    assert.equal(other.status, "active");
    assert.equal(other.deleted_at, null);
  });
});
