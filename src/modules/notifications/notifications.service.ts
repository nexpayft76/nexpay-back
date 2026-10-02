import { sendEmailWithSes } from "../../integrations/ses.client";
import { logger } from "../../utils/logger";
import { notificationsRepository } from "./notifications.repository";
import {
  buildAlertEmail,
  buildDepositEmail,
  buildExchangeEmail,
  buildWelcomeEmail,
} from "./notifications.templates";
import type {
  DepositNotificationData,
  ExchangeNotificationData,
  AlertEmailData,
  NotificationEmailType,
  NotificationRecipient,
} from "./notifications.types";

interface TrackedEmailInput {
  user: NotificationRecipient;
  email_type: NotificationEmailType;
  subject: string;
  html: string;
  text: string;
}

async function sendAndRecordEmail(input: TrackedEmailInput): Promise<void> {
  let notificationId: string | null = null;

  try {
    notificationId = await notificationsRepository.createPending({
      user_id: input.user.id,
      recipient_email: input.user.email,
      email_type: input.email_type,
      subject: input.subject,
    });
  } catch (err) {
    logger.error("No se pudo crear el registro del email", {
      error: err instanceof Error ? err.message : String(err),
      email: input.user.email,
    });
  }

  let result: Awaited<ReturnType<typeof sendEmailWithSes>>;
  try {
    result = await sendEmailWithSes({
      to: input.user.email,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!notificationId) return;

  try {
    await notificationsRepository.updateResult(notificationId, {
      status: result.success ? "sent" : "failed",
      provider_message_id: result.messageId,
      error_message: result.error,
    });
  } catch (err) {
    logger.error("No se pudo actualizar el resultado del email", {
      error: err instanceof Error ? err.message : String(err),
      email: input.user.email,
      notificationId,
    });
  }
}

export const notificationsService = {
  /**
   * 1. Envía email de agradecimiento y bienvenida tras registrarse en NexPay.
   */
  async sendWelcomeEmail(user: NotificationRecipient): Promise<void> {
    try {
      const email = buildWelcomeEmail(user);
      await sendAndRecordEmail({
        user,
        email_type: "welcome",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de bienvenida", {
        error: err instanceof Error ? err.message : String(err),
        email: user.email,
      });
    }
  },

  /**
   * 2. Envía email con el resumen de la transacción realizada (compra, venta o intercambio).
   */
  async sendExchangeEmail(data: ExchangeNotificationData): Promise<void> {
    try {
      const email = buildExchangeEmail(data);
      await sendAndRecordEmail({
        user: data.user,
        email_type: "exchange",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de resumen de transacción", {
        error: err instanceof Error ? err.message : String(err),
        email: data.user.email,
        transactionId: data.transaction_id,
      });
    }
  },

  /**
   * 3. Envía email con el resumen cuando el usuario recarga saldo en su billetera.
   */
  async sendDepositEmail(data: DepositNotificationData): Promise<void> {
    try {
      const email = buildDepositEmail(data);
      await sendAndRecordEmail({
        user: data.user,
        email_type: "deposit",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de resumen de recarga", {
        error: err instanceof Error ? err.message : String(err),
        email: data.user.email,
        transactionId: data.transaction_id,
      });
    }
  },

  async sendAlertEmail(data: AlertEmailData): Promise<void> {
    try {
      const email = buildAlertEmail(data);
      await sendAndRecordEmail({
        user: data.user,
        email_type: "alert",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de alerta", {
        error: err instanceof Error ? err.message : String(err),
        email: data.user.email,
      });
    }
  },
};
