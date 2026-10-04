import { sendEmailWithSes } from "../../integrations/ses.client";
import { logger } from "../../utils/logger";
import { usersRepository } from "../users/users.repository";
import { notificationsRepository } from "./notifications.repository";
import {
  buildAlertEmail,
  buildDepositEmail,
  buildExchangeEmail,
  buildP2PEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildWelcomeEmail,
} from "./notifications.templates";
import type {
  AlertEmailData,
  DepositNotificationData,
  ExchangeNotificationData,
  NotificationEmailType,
  NotificationRecipient,
  P2PEmailData,
} from "./notifications.types";

interface TrackedEmailInput {
  user: NotificationRecipient;
  email_type: NotificationEmailType;
  subject: string;
  html: string;
  text: string;
}

async function userWithSavedTheme(user: NotificationRecipient): Promise<NotificationRecipient> {
  try {
    return { ...user, theme: (await usersRepository.getThemeById(user.id)) ?? user.theme ?? "dark" };
  } catch {
    return { ...user, theme: user.theme ?? "dark" };
  }
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
      const email = buildWelcomeEmail(await userWithSavedTheme(user));
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

  async sendPasswordChangedEmail(user: NotificationRecipient): Promise<void> {
    try {
      const email = buildPasswordChangedEmail(await userWithSavedTheme(user));
      await sendAndRecordEmail({
        user,
        email_type: "password_changed",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de cambio de contraseña", {
        error: err instanceof Error ? err.message : String(err),
        email: user.email,
      });
    }
  },

  async sendPasswordResetEmail(data: { user: NotificationRecipient; resetUrl: string }): Promise<void> {
    try {
      const email = buildPasswordResetEmail({
        ...data,
        user: await userWithSavedTheme(data.user),
      });
      await sendAndRecordEmail({
        user: data.user,
        email_type: "password_reset",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email de restablecimiento de contraseña", {
        error: err instanceof Error ? err.message : String(err),
        email: data.user.email,
      });
    }
  },

  /**
   * 2. Envía email con el resumen de la transacción realizada (compra, venta o intercambio).
   */
  async sendExchangeEmail(data: ExchangeNotificationData): Promise<void> {
    try {
      const email = buildExchangeEmail({ ...data, user: await userWithSavedTheme(data.user) });
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
      const email = buildDepositEmail({ ...data, user: await userWithSavedTheme(data.user) });
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

  /**
   * 5. Email del mercado P2P (oferta publicada, vendida, comprada, cancelada o vencida).
   */
  async sendP2PEmail(data: P2PEmailData): Promise<void> {
    try {
      const email = buildP2PEmail({ ...data, user: await userWithSavedTheme(data.user) });
      await sendAndRecordEmail({
        user: data.user,
        email_type: "p2p",
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error("Error al procesar el email P2P", {
        error: err instanceof Error ? err.message : String(err),
        email: data.user.email,
        offerId: data.offer_id,
        event: data.event,
      });
    }
  },

  async sendAlertEmail(data: AlertEmailData): Promise<void> {
    try {
      const email = buildAlertEmail({ ...data, user: await userWithSavedTheme(data.user) });
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
