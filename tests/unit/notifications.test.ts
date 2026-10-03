import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "../../src/config/env";
import {
  buildAlertEmail,
  buildDepositEmail,
  buildExchangeEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildWelcomeEmail,
} from "../../src/modules/notifications/notifications.templates";
import { notificationsRepository } from "../../src/modules/notifications/notifications.repository";
import { notificationsService } from "../../src/modules/notifications/notifications.service";
import { usersRepository } from "../../src/modules/users/users.repository";

describe("Notifications Module - AWS SES Emails", () => {
  const dummyUser = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "test.user@example.com",
    full_name: "Carlos Gómez",
  };

  it("1. buildWelcomeEmail genera plantilla de bienvenida con aviso de dinero ficticio", () => {
    const email = buildWelcomeEmail(dummyUser);

    assert.ok(email.subject.includes("Bienvenido a NexPay"));
    assert.ok(email.html.includes("Carlos"));
    assert.ok(email.html.includes("Dinero Ficticio"));
    assert.ok(email.html.includes("Entorno de Demostración"));
    assert.ok(email.text.includes("ficticios en modo de demostración"));
    const link = email.html.match(/<a href="([^"]+)"/)?.[1];
    assert.equal(link, env.frontendAppUrl);
    assert.ok(link && !link.includes(","));
    assert.ok(email.text.includes(`ACCEDE A TU CUENTA:\n${env.frontendAppUrl}`));
  });

  it("usa la paleta clara cuando el usuario tiene ese tema activo", () => {
    const email = buildWelcomeEmail({ ...dummyUser, theme: "light" });

    assert.ok(email.html.includes("background-color: #faf7f0"));
    assert.ok(email.html.includes("color: #17140e"));
    assert.ok(!email.html.includes("background-color: #0a0a0a"));
  });

  it("buildPasswordChangedEmail informa el cambio sin incluir ninguna contraseña", () => {
    const email = buildPasswordChangedEmail(dummyUser);
    const escapedNameEmail = buildPasswordChangedEmail({ ...dummyUser, full_name: "<Carlos>" });

    assert.equal(email.subject, "Se cambió la contraseña de tu cuenta NexPay");
    assert.ok(email.html.includes("se cambió correctamente"));
    assert.ok(email.text.includes("se cambió correctamente"));
    assert.ok(email.html.includes("Si no realizaste este cambio"));
    assert.ok(email.text.includes("Si no realizaste este cambio"));
    assert.ok(escapedNameEmail.html.includes("Hola, &lt;Carlos&gt;"));
  });

  it("buildPasswordResetEmail incluye un enlace de un solo uso y escapa su URL", () => {
    const email = buildPasswordResetEmail({
      user: dummyUser,
      resetUrl: "https://nexpay.example/reset-password?token=abc&next=<unsafe>",
    });

    assert.ok(email.subject.includes("Restablece tu contraseña"));
    assert.ok(email.html.includes("https://nexpay.example/reset-password?token=abc&amp;next=&lt;unsafe&gt;"));
    assert.ok(email.text.includes("https://nexpay.example/reset-password?token=abc&next=<unsafe>"));
    assert.ok(email.html.includes("vence en una hora"));
    assert.ok(email.text.includes("solo puede usarse una vez"));
  });

  it("2. buildExchangeEmail genera resumen de transacción (compra/venta) con detalles y aviso ficticio", () => {
    const exchangeData = {
      user: dummyUser,
      type: "BUY",
      from_currency: "COP",
      to_currency: "USD",
      from_amount: "100000.00",
      to_amount: "25.00",
      rate: 0.00025,
      fee_amount: "0.00",
      fee_percent: 0,
      transaction_id: "tx-12345-abcde",
      created_at: new Date().toISOString(),
    };

    const email = buildExchangeEmail(exchangeData);

    assert.ok(email.subject.includes("Compra de Divisa"));
    assert.ok(email.html.includes("Compra de Divisa"));
    assert.ok(email.html.includes("100000.00 COP"));
    assert.ok(email.html.includes("+25.00 USD"));
    assert.ok(email.html.includes("tx-12345-abcde"));
    assert.ok(email.html.includes("Dinero Ficticio"));
    assert.ok(email.text.includes("dinero ficticio"));
  });

  it("3. buildDepositEmail genera resumen de recarga de saldo con montos y aviso ficticio", () => {
    const depositData = {
      user: dummyUser,
      currency: "COP",
      amount: "500000.00",
      new_balance: "1500000.00",
      transaction_id: "tx-deposit-999",
      created_at: new Date().toISOString(),
    };

    const email = buildDepositEmail(depositData);

    assert.ok(email.subject.includes("+500000.00 COP"));
    assert.ok(email.html.includes("Recarga Exitosa"));
    assert.ok(email.html.includes("+500000.00 COP"));
    assert.ok(email.html.includes("1500000.00 COP"));
    assert.ok(email.html.includes("tx-deposit-999"));
    assert.ok(email.html.includes("Dinero Ficticio"));
    assert.ok(email.text.includes("saldo virtual de prueba"));
  });

  it("buildAlertEmail genera el aviso y escapa el contenido dinámico", () => {
    const email = buildAlertEmail({
      user: { ...dummyUser, full_name: "<Carlos>" },
      title: "Saldo bajo en COP",
      message: "Tu saldo quedó en 10 COP < 20 COP.",
    });

    assert.ok(email.subject.includes("Alerta de NexPay"));
    assert.ok(email.html.includes("&lt;Carlos&gt;"));
    assert.ok(email.html.includes("10 COP &lt; 20 COP"));
    assert.ok(email.text.includes("Saldo bajo en COP"));
  });

  it("4. limita los decimales a 2 al mostrar saldos y montos (ej. 12345.6789 -> 12345.68)", () => {
    const depositWithLongDecimals = {
      user: dummyUser,
      currency: "USD",
      amount: "50.5555",
      new_balance: "1234.5678",
      transaction_id: "tx-deposit-decimals",
      created_at: new Date().toISOString(),
    };

    const email = buildDepositEmail(depositWithLongDecimals);

    assert.ok(email.html.includes("+50.56 USD"));
    assert.ok(email.html.includes("1234.57 USD"));
    assert.ok(email.text.includes("+50.56 USD"));
    assert.ok(email.text.includes("1234.57 USD"));
    assert.ok(!email.html.includes("1234.5678"));
  });

  it("notificationsService expone los métodos requeridos y no lanza excepciones no controladas", async () => {
    assert.equal(typeof notificationsService.sendWelcomeEmail, "function");
    assert.equal(typeof notificationsService.sendPasswordChangedEmail, "function");
    assert.equal(typeof notificationsService.sendPasswordResetEmail, "function");
    assert.equal(typeof notificationsService.sendExchangeEmail, "function");
    assert.equal(typeof notificationsService.sendDepositEmail, "function");
    assert.equal(typeof notificationsService.sendAlertEmail, "function");

    const originalCreatePending = notificationsRepository.createPending;
    const originalUpdateResult = notificationsRepository.updateResult;
    const originalGetThemeById = usersRepository.getThemeById;
    const originalSesConfigured = env.aws.isConfigured;
    let insertedInput: Parameters<typeof notificationsRepository.createPending>[0] | undefined;
    let updatedResult: Parameters<typeof notificationsRepository.updateResult>[1] | undefined;

    notificationsRepository.createPending = async (input) => {
      insertedInput = input;
      return "notification-test-id";
    };
    notificationsRepository.updateResult = async (_id, result) => {
      updatedResult = result;
    };
    usersRepository.getThemeById = async () => "dark";
    env.aws.isConfigured = false;

    try {
      await assert.doesNotReject(async () => {
        await notificationsService.sendWelcomeEmail(dummyUser);
      });
      assert.deepEqual(insertedInput, {
        user_id: dummyUser.id,
        recipient_email: dummyUser.email,
        email_type: "welcome",
        subject: "¡Bienvenido a NexPay! Gracias por registrarte",
      });
      assert.deepEqual(updatedResult, {
        status: "failed",
        provider_message_id: undefined,
        error_message: "AWS_SES_NOT_CONFIGURED",
      });

      await assert.doesNotReject(async () => {
        await notificationsService.sendPasswordChangedEmail(dummyUser);
      });
      assert.deepEqual(insertedInput, {
        user_id: dummyUser.id,
        recipient_email: dummyUser.email,
        email_type: "password_changed",
        subject: "Se cambió la contraseña de tu cuenta NexPay",
      });
      assert.deepEqual(updatedResult, {
        status: "failed",
        provider_message_id: undefined,
        error_message: "AWS_SES_NOT_CONFIGURED",
      });

      await assert.doesNotReject(async () => {
        await notificationsService.sendPasswordResetEmail({
          user: dummyUser,
          resetUrl: "https://nexpay.example/reset-password?token=abc",
        });
      });
      assert.deepEqual(insertedInput, {
        user_id: dummyUser.id,
        recipient_email: dummyUser.email,
        email_type: "password_reset",
        subject: "Restablece tu contraseña de NexPay",
      });

      await assert.doesNotReject(async () => {
        await notificationsService.sendAlertEmail({
          user: dummyUser,
          title: "Saldo bajo en COP",
          message: "Tu saldo quedó en 10 COP.",
        });
      });
      assert.deepEqual(insertedInput, {
        user_id: dummyUser.id,
        recipient_email: dummyUser.email,
        email_type: "alert",
        subject: "Saldo bajo en COP | Alerta de NexPay",
      });
      assert.deepEqual(updatedResult, {
        status: "failed",
        provider_message_id: undefined,
        error_message: "AWS_SES_NOT_CONFIGURED",
      });
    } finally {
      notificationsRepository.createPending = originalCreatePending;
      notificationsRepository.updateResult = originalUpdateResult;
      usersRepository.getThemeById = originalGetThemeById;
      env.aws.isConfigured = originalSesConfigured;
    }
  });
});
