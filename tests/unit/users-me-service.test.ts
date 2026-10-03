import "../helpers/test-env";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";
import { authRepository, type AuthUserRecord } from "../../src/modules/auth/auth.repository";
import { notificationsService } from "../../src/modules/notifications";
import { isTokenRevoked } from "../../src/modules/auth/auth.token-blacklist";
import { usersRepository, type MyProfile } from "../../src/modules/users/users.repository";
import { usersService } from "../../src/modules/users/users.service";
import { AppError } from "../../src/utils/app-error";

const PASSWORD = "Secreta123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const profile: MyProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ana Pérez",
  email: "ana@nexpay.com",
  status: "active",
  created_at: "2026-03-05T10:00:00.000Z",
};

function authUser(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    password_hash: PASSWORD_HASH,
    session_version: 0,
    status: "active",
    created_at: new Date(profile.created_at),
    deleted_at: null,
    ...overrides,
  };
}

let jtiCounter = 0;
function newAuth() {
  jtiCounter += 1;
  return { userId: profile.id, jti: `jti-service-${jtiCounter}`, exp: Math.floor(Date.now() / 1000) + 3600 };
}

async function assertAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `se esperaba AppError y llegó ${String(err)}`);
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.code, code);
    return true;
  });
}

function uniqueViolation(): DatabaseError {
  const err = new DatabaseError("duplicate key value violates unique constraint", 0, "error");
  err.code = "23505";
  return err;
}

describe("usersService.updateMe", () => {
  afterEach(() => mock.restoreAll());

  it("devuelve el perfil actualizado y pasa solo lo recibido al repositorio", async () => {
    const update = mock.method(usersRepository, "updateProfile", async () => ({ ...profile, full_name: "Ana M. Pérez" }));

    const result = await usersService.updateMe(profile.id, { full_name: "Ana M. Pérez" });

    assert.equal(result.full_name, "Ana M. Pérez");
    assert.deepEqual(update.mock.calls[0].arguments, [profile.id, { full_name: "Ana M. Pérez" }]);
  });

  it("traduce el email repetido (UNIQUE) a 409 EMAIL_ALREADY_REGISTERED", async () => {
    mock.method(usersRepository, "updateProfile", async () => {
      throw uniqueViolation();
    });
    await assertAppError(usersService.updateMe(profile.id, { email: "otra@nexpay.com" }), 409, "EMAIL_ALREADY_REGISTERED");
  });

  it("relanza los errores de base de datos que no son de unicidad", async () => {
    const dbError = new DatabaseError("connection lost", 0, "error");
    dbError.code = "08006";
    mock.method(usersRepository, "updateProfile", async () => {
      throw dbError;
    });
    await assert.rejects(usersService.updateMe(profile.id, { full_name: "Ana" }), (err) => err === dbError);
  });

  it("responde 401 si el usuario ya no existe", async () => {
    mock.method(usersRepository, "updateProfile", async () => null);
    await assertAppError(usersService.updateMe(profile.id, { full_name: "Ana" }), 401, "UNAUTHORIZED");
  });
});

describe("usersService.closeMyAccount", () => {
  beforeEach(() => {
    mock.method(authRepository, "findActiveById", async () => authUser());
  });
  afterEach(() => mock.restoreAll());

  it("cierra la cuenta con la contraseña correcta y revoca el token actual", async () => {
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const auth = newAuth();
    assert.equal(isTokenRevoked(auth.jti), false);

    await usersService.closeMyAccount(auth, PASSWORD);

    assert.equal(close.mock.callCount(), 1);
    assert.deepEqual(close.mock.calls[0].arguments, [profile.id]);
    assert.equal(isTokenRevoked(auth.jti), true);
  });

  it("con contraseña incorrecta responde 403 INVALID_PASSWORD, no cierra y no revoca el token", async () => {
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const auth = newAuth();

    await assertAppError(usersService.closeMyAccount(auth, "Incorrecta1"), 403, "INVALID_PASSWORD");

    assert.equal(close.mock.callCount(), 0);
    assert.equal(isTokenRevoked(auth.jti), false);
  });

  it("con saldo responde 409 ACCOUNT_HAS_BALANCE y no revoca el token", async () => {
    mock.method(usersRepository, "close", async () => "has_balance" as const);
    const auth = newAuth();

    await assertAppError(usersService.closeMyAccount(auth, PASSWORD), 409, "ACCOUNT_HAS_BALANCE");

    assert.equal(isTokenRevoked(auth.jti), false);
  });

  it("responde 401 si el usuario no existe (antes de verificar la contraseña)", async () => {
    mock.restoreAll();
    mock.method(authRepository, "findActiveById", async () => null);
    const close = mock.method(usersRepository, "close", async () => "closed" as const);

    await assertAppError(usersService.closeMyAccount(newAuth(), PASSWORD), 401, "UNAUTHORIZED");
    assert.equal(close.mock.callCount(), 0);
  });

  it("responde 401 si el usuario desaparece entre la verificación y el cierre", async () => {
    mock.method(usersRepository, "close", async () => "not_found" as const);
    const auth = newAuth();

    await assertAppError(usersService.closeMyAccount(auth, PASSWORD), 401, "UNAUTHORIZED");
    assert.equal(isTokenRevoked(auth.jti), false);
  });

  it("en una cuenta sin contraseña (Google) omite el control y cierra", async () => {
    mock.restoreAll();
    mock.method(authRepository, "findActiveById", async () => authUser({ password_hash: null }));
    const close = mock.method(usersRepository, "close", async () => "closed" as const);
    const auth = newAuth();

    await usersService.closeMyAccount(auth);

    assert.equal(close.mock.callCount(), 1);
    assert.equal(isTokenRevoked(auth.jti), true);
  });
});

describe("usersService.changeMyPassword", () => {
  const NEW_PASSWORD = "NuevaSecreta456";

  beforeEach(() => {
    mock.method(authRepository, "findActiveById", async () => authUser());
  });
  afterEach(() => mock.restoreAll());

  it("guarda un hash bcrypt de la nueva contraseña (nunca el texto plano)", async () => {
    const save = mock.method(usersRepository, "updatePasswordHash", async () => true);
    const sendPasswordChangedEmail = mock.method(notificationsService, "sendPasswordChangedEmail", async () => {});

    await usersService.changeMyPassword(profile.id, PASSWORD, NEW_PASSWORD);

    const [id, hash] = save.mock.calls[0].arguments;
    assert.equal(id, profile.id);
    assert.notEqual(hash, NEW_PASSWORD);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, hash), true);
    assert.deepEqual(sendPasswordChangedEmail.mock.calls[0].arguments, [{
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
    }]);
  });

  it("con la contraseña actual incorrecta responde 403 INVALID_PASSWORD y no guarda", async () => {
    const save = mock.method(usersRepository, "updatePasswordHash", async () => true);
    await assertAppError(usersService.changeMyPassword(profile.id, "Incorrecta1", NEW_PASSWORD), 403, "INVALID_PASSWORD");
    assert.equal(save.mock.callCount(), 0);
  });

  it("si la nueva es igual a la actual responde 400 PASSWORD_UNCHANGED y no guarda", async () => {
    const save = mock.method(usersRepository, "updatePasswordHash", async () => true);
    await assertAppError(usersService.changeMyPassword(profile.id, PASSWORD, PASSWORD), 400, "PASSWORD_UNCHANGED");
    assert.equal(save.mock.callCount(), 0);
  });

  it("en una cuenta sin contraseña (Google) responde 409 PASSWORD_NOT_SET", async () => {
    mock.restoreAll();
    mock.method(authRepository, "findActiveById", async () => authUser({ password_hash: null }));
    await assertAppError(usersService.changeMyPassword(profile.id, PASSWORD, NEW_PASSWORD), 409, "PASSWORD_NOT_SET");
  });

  it("responde 401 si el usuario no existe o desaparece al guardar", async () => {
    const sendPasswordChangedEmail = mock.method(notificationsService, "sendPasswordChangedEmail", async () => {});
    mock.method(usersRepository, "updatePasswordHash", async () => false);
    await assertAppError(usersService.changeMyPassword(profile.id, PASSWORD, NEW_PASSWORD), 401, "UNAUTHORIZED");
    assert.equal(sendPasswordChangedEmail.mock.callCount(), 0);

    mock.restoreAll();
    mock.method(authRepository, "findActiveById", async () => null);
    await assertAppError(usersService.changeMyPassword(profile.id, PASSWORD, NEW_PASSWORD), 401, "UNAUTHORIZED");
  });
});
