import "../helpers/test-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import bcrypt from "bcryptjs";
import { authRepository, type AuthUserRecord } from "../../src/modules/auth/auth.repository";
import { authService } from "../../src/modules/auth/auth.service";
import { passwordResetRepository } from "../../src/modules/auth/password-reset.repository";
import { notificationsService } from "../../src/modules/notifications";
import { AppError } from "../../src/utils/app-error";

const user: AuthUserRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ana Pérez",
  email: "ana@nexpay.com",
  password_hash: "existing-hash",
  session_version: 0,
  role: "user",
  is_owner: false,
  status: "active",
  created_at: new Date("2026-03-05T10:00:00.000Z"),
  deleted_at: null,
};

describe("authService password reset", () => {
  afterEach(() => mock.restoreAll());

  it("does not reveal or create reset tokens for unknown emails", async () => {
    mock.method(authRepository, "findByEmail", async () => null);
    const createToken = mock.method(passwordResetRepository, "create", async () => true);
    const sendEmail = mock.method(notificationsService, "sendPasswordResetEmail", async () => {});

    await authService.requestPasswordReset("unknown@example.com");

    assert.equal(createToken.mock.callCount(), 0);
    assert.equal(sendEmail.mock.callCount(), 0);
  });

  it("creates a hashed one-hour token and sends its link for an active password account", async () => {
    mock.method(authRepository, "findByEmail", async () => user);
    const createToken = mock.method(passwordResetRepository, "create", async () => true);
    const sendEmail = mock.method(notificationsService, "sendPasswordResetEmail", async () => {});
    const before = Date.now();

    await authService.requestPasswordReset(user.email);

    const [userId, tokenHash, expiresAt] = createToken.mock.calls[0].arguments;
    assert.equal(userId, user.id);
    assert.match(tokenHash, /^[a-f\d]{64}$/);
    assert.ok(expiresAt.getTime() >= before + 60 * 60 * 1000);
    assert.ok(expiresAt.getTime() <= Date.now() + 60 * 60 * 1000);

    const [{ resetUrl }] = sendEmail.mock.calls[0].arguments;
    const url = new URL(resetUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    assert.equal(url.pathname, "/reset-password");
    assert.ok(token);
    assert.equal(createHash("sha256").update(token!).digest("hex"), tokenHash);
  });

  it("replaces the password with a bcrypt hash and sends the password-changed notice", async () => {
    const token = "a".repeat(64);
    mock.method(passwordResetRepository, "isValid", async () => true);
    const consume = mock.method(passwordResetRepository, "consumeAndUpdatePassword", async () => ({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    }));
    const sendEmail = mock.method(notificationsService, "sendPasswordChangedEmail", async () => {});
    const newPassword = "NuevaClave123";

    await authService.resetPassword(token, newPassword);

    const [tokenHash, passwordHash] = consume.mock.calls[0].arguments;
    assert.equal(tokenHash, createHash("sha256").update(token).digest("hex"));
    assert.equal(await bcrypt.compare(newPassword, passwordHash), true);
    assert.deepEqual(sendEmail.mock.calls[0].arguments, [{
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    }]);
  });

  it("rejects invalid or expired tokens without changing a password", async () => {
    mock.method(passwordResetRepository, "isValid", async () => false);
    const consume = mock.method(passwordResetRepository, "consumeAndUpdatePassword", async () => null);

    await assert.rejects(
      authService.resetPassword("b".repeat(64), "NuevaClave123"),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_OR_EXPIRED_RESET_TOKEN",
    );
    assert.equal(consume.mock.callCount(), 0);
  });
});
