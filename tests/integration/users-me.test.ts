import "../helpers/test-env";
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseError } from "pg";
import { app } from "../../src/app";
import { env } from "../../src/config/env";
import { authRepository, type AuthUserRecord } from "../../src/modules/auth/auth.repository";
import { usersRepository, type MyProfile } from "../../src/modules/users/users.repository";

// Se levanta la app real de Express en un puerto libre y se le pegan peticiones HTTP de verdad.
// Solo se reemplaza la base de datos (los repositorios): rutas, validación, sesión, cookie, CSRF y
// límite de intentos son los reales.

const PASSWORD = "Secreta123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const USER_ID = "11111111-1111-4111-8111-111111111111";

const profile: MyProfile = {
  id: USER_ID,
  full_name: "Ana Pérez",
  email: "ana@nexpay.com",
  status: "active",
  created_at: "2026-03-05T10:00:00.000Z",
};

const dbUser: AuthUserRecord = {
  id: USER_ID,
  full_name: profile.full_name,
  email: profile.email,
  password_hash: PASSWORD_HASH,
  status: "active",
  created_at: new Date(profile.created_at),
  deleted_at: null,
};

let server: http.Server;
let baseUrl: string;
let jtiCounter = 0;

function tokenFor(userId = USER_ID): string {
  jtiCounter += 1;
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    jwtid: `jti-http-${jtiCounter}`,
    expiresIn: 3600,
    algorithm: "HS256",
  });
}

interface Reply {
  status: number;
  body: any;
  headers: Headers;
}

async function call(method: string, path: string, options: { token?: string | null; body?: unknown } = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.token !== null) headers.Authorization = `Bearer ${options.token ?? tokenFor()}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

/** fetch no deja fijar Origin; para probar la defensa CSRF de la cookie se usa http.request. */
function callWithCookie(method: string, path: string, token: string, origin: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method,
        headers: {
          Cookie: `nexpay_session=${token}`,
          Origin: origin,
          ...(payload && { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function uniqueViolation(): DatabaseError {
  const err = new DatabaseError("duplicate key value violates unique constraint", 0, "error");
  err.code = "23505";
  return err;
}

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

beforeEach(() => {
  // El usuario "existe y está activo" para la sesión (requireAuth) y para el cierre de cuenta.
  mock.method(authRepository, "findActiveById", async (id: string) => (id === USER_ID ? dbUser : null));
});

afterEach(() => mock.restoreAll());

describe("PATCH /api/users/me", () => {
  it("sin sesión responde 401", async () => {
    const res = await call("PATCH", "/api/users/me", { token: null, body: { full_name: "Ana M." } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "UNAUTHORIZED");
  });

  it("actualiza el nombre y devuelve el usuario público", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => ({ ...profile, full_name: "Ana M. Pérez" }));

    const res = await call("PATCH", "/api/users/me", { body: { full_name: "  Ana M. Pérez  " } });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { ...profile, full_name: "Ana M. Pérez" });
    assert.deepEqual(update.mock.calls[0].arguments, [USER_ID, { full_name: "Ana M. Pérez" }]);
    assert.equal("password_hash" in res.body.data, false);
  });

  it("guarda el email en minúsculas y edita siempre al usuario de la sesión", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => ({ ...profile, email: "nueva@nexpay.com" }));

    const res = await call("PATCH", "/api/users/me", { body: { email: "NUEVA@NexPay.com" } });

    assert.equal(res.status, 200);
    assert.deepEqual(update.mock.calls[0].arguments, [USER_ID, { email: "nueva@nexpay.com" }]);
  });

  it("no deja que un usuario común cambie su estado ni otros campos", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => profile);

    for (const body of [{ status: "active" }, { full_name: "Ana", status: "suspended" }, { id: "x" }, { password: "Nueva123" }]) {
      const res = await call("PATCH", "/api/users/me", { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error, "INVALID_PROFILE_PAYLOAD");
    }
    assert.equal(update.mock.callCount(), 0);
  });

  it("rechaza body vacío, nombre corto y email inválido con el detalle por campo", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => profile);

    const empty = await call("PATCH", "/api/users/me", { body: {} });
    assert.equal(empty.status, 400);

    const bad = await call("PATCH", "/api/users/me", { body: { full_name: "A", email: "x" } });
    assert.equal(bad.status, 400);
    const paths = bad.body.details.map((d: { path: string }) => d.path).sort();
    assert.deepEqual(paths, ["email", "full_name"]);
    assert.equal(update.mock.callCount(), 0);
  });

  it("responde 409 si el email ya lo usa otra cuenta", async () => {
    mock.method(usersRepository, "updateProfile", async () => {
      throw uniqueViolation();
    });
    const res = await call("PATCH", "/api/users/me", { body: { email: "otra@nexpay.com" } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "EMAIL_ALREADY_REGISTERED");
  });

  it("no choca con PATCH /api/users/:id: /me no se interpreta como un id ni pide ser administrador", async () => {
    mock.method(usersRepository, "updateProfile", async () => profile);
    const res = await call("PATCH", "/api/users/me", { body: { full_name: "Ana Pérez" } });
    assert.notEqual(res.status, 403);
    assert.notEqual(res.body?.error, "INVALID_USER_ID");
    assert.equal(res.status, 200);
  });

  it("con la cookie de sesión rechaza un Origin que no es el del front (CSRF)", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => profile);
    const res = await callWithCookie("PATCH", "/api/users/me", tokenFor(), "https://sitio-malicioso.example", { full_name: "Hackeada" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "FORBIDDEN_ORIGIN");
    assert.equal(update.mock.callCount(), 0);
  });

  it("con la cookie de sesión y el Origin del front funciona", async () => {
    mock.method(usersRepository, "updateProfile", async () => profile);
    const res = await callWithCookie("PATCH", "/api/users/me", tokenFor(), "http://localhost:5173", { full_name: "Ana Pérez" });
    assert.equal(res.status, 200);
  });
});

describe("DELETE /api/users/me", () => {
  it("sin sesión responde 401", async () => {
    const res = await call("DELETE", "/api/users/me", { token: null, body: { password: PASSWORD } });
    assert.equal(res.status, 401);
  });

  it("sin contraseña responde 400 y no toca la cuenta", async () => {
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const res = await call("DELETE", "/api/users/me", { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_CLOSE_ACCOUNT_PAYLOAD");
    assert.equal(close.mock.callCount(), 0);
  });

  it("con contraseña incorrecta responde 403 (nunca 401) y no cierra la cuenta", async () => {
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const token = tokenFor();

    const res = await call("DELETE", "/api/users/me", { token, body: { password: "Incorrecta1" } });

    assert.equal(res.status, 403);
    assert.equal(res.body.error, "INVALID_PASSWORD");
    assert.equal(close.mock.callCount(), 0);
    // La sesión sigue viva: equivocarse al escribir la contraseña no la cierra.
    const me = await call("GET", "/api/auth/me", { token });
    assert.equal(me.status, 200);
  });

  it("con saldo responde 409 ACCOUNT_HAS_BALANCE y la sesión sigue activa", async () => {
    mock.method(usersRepository, "close", async () => "has_balance" as const);
    const token = tokenFor();

    const res = await call("DELETE", "/api/users/me", { token, body: { password: PASSWORD } });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "ACCOUNT_HAS_BALANCE");
    assert.equal((await call("GET", "/api/auth/me", { token })).status, 200);
  });

  it("cierra la cuenta: 204, borra la cookie e invalida el token", async () => {
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const token = tokenFor();

    const res = await call("DELETE", "/api/users/me", { token, body: { password: PASSWORD } });

    assert.equal(res.status, 204);
    assert.deepEqual(close.mock.calls[0].arguments, [USER_ID]);
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /nexpay_session=;/);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/);

    // Con el mismo token ya no se puede entrar.
    const after = await call("GET", "/api/auth/me", { token });
    assert.equal(after.status, 401);
    assert.equal(after.body.message, "La sesión fue cerrada");
  });

  it("no choca con DELETE /api/users/:id (solo administradores)", async () => {
    mock.method(usersRepository, "close", async () => "closed" as const);
    const res = await call("DELETE", "/api/users/me", { body: { password: PASSWORD } });
    assert.equal(res.status, 204);

    const asNormalUser = await call("DELETE", `/api/users/${USER_ID}`);
    assert.equal(asNormalUser.status, 403);
    assert.equal(asNormalUser.body.error, "FORBIDDEN");
  });

  it("limita los intentos por IP (se verifica una contraseña aquí)", async () => {
    mock.method(usersRepository, "close", async () => "has_balance" as const);

    let limited: Reply | undefined;
    for (let attempt = 0; attempt < 10 && !limited; attempt += 1) {
      const res = await call("DELETE", "/api/users/me", { body: { password: "Incorrecta1" } });
      if (res.status === 429) limited = res;
    }

    assert.ok(limited, "debería haber respondido 429 antes de 10 intentos");
    assert.equal(limited.body.error, "TOO_MANY_REQUESTS");
    assert.ok(limited.headers.get("retry-after"));
  });
});

describe("PATCH /api/users/me/password", () => {
  const body = { current_password: PASSWORD, new_password: "NuevaSecreta456" };

  it("sin sesión responde 401", async () => {
    const res = await call("PATCH", "/api/users/me/password", { token: null, body });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "UNAUTHORIZED");
  });

  it("cambia la contraseña y responde 204", async () => {
    const save = mock.method(usersRepository, "updatePasswordHash", async () => true);

    const res = await call("PATCH", "/api/users/me/password", { body });

    assert.equal(res.status, 204);
    assert.equal(save.mock.callCount(), 1);
    assert.equal(save.mock.calls[0].arguments[0], USER_ID);
  });

  it("con la contraseña actual incorrecta responde 403 (no 401) y no guarda", async () => {
    const save = mock.method(usersRepository, "updatePasswordHash", async () => true);

    const res = await call("PATCH", "/api/users/me/password", { body: { ...body, current_password: "Incorrecta1" } });

    assert.equal(res.status, 403);
    assert.equal(res.body.error, "INVALID_PASSWORD");
    assert.equal(save.mock.callCount(), 0);
  });

  it("con una nueva contraseña débil responde 400 INVALID_CHANGE_PASSWORD_PAYLOAD", async () => {
    const res = await call("PATCH", "/api/users/me/password", { body: { ...body, new_password: "corta" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_CHANGE_PASSWORD_PAYLOAD");
  });

  it("limita los intentos por IP (429)", async () => {
    mock.method(usersRepository, "updatePasswordHash", async () => true);
    let limited: Reply | undefined;
    for (let i = 0; i < 10 && !limited; i++) {
      const res = await call("PATCH", "/api/users/me/password", { body });
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, "debería haber respondido 429 antes de 10 intentos");
    assert.equal(limited.body.error, "TOO_MANY_REQUESTS");
  });
});
