import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDepositEmail,
  buildExchangeEmail,
  buildWelcomeEmail,
} from "../../src/modules/notifications/notifications.templates";
import { notificationsService } from "../../src/modules/notifications/notifications.service";

describe("Notifications Module - AWS SES Emails", () => {
  const dummyUser = {
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

    // Saldo y monto deben mostrarse redondeados a exactamente 2 decimales
    assert.ok(email.html.includes("+50.56 USD"));
    assert.ok(email.html.includes("1234.57 USD"));
    assert.ok(email.text.includes("+50.56 USD"));
    assert.ok(email.text.includes("1234.57 USD"));

    // No debe contener los decimales adicionales sin redondear
    assert.ok(!email.html.includes("1234.5678"));
  });

  it("notificationsService expone los métodos requeridos y no lanza excepciones no controladas", async () => {
    assert.equal(typeof notificationsService.sendWelcomeEmail, "function");
    assert.equal(typeof notificationsService.sendExchangeEmail, "function");
    assert.equal(typeof notificationsService.sendDepositEmail, "function");

    // Debe resolver sin lanzar error incluso si AWS SES falla o en sandbox
    await assert.doesNotReject(async () => {
      await notificationsService.sendWelcomeEmail(dummyUser);
    });
  });
});
