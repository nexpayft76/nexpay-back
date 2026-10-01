import { sendEmailWithSes } from "../../integrations/ses.client";
import { logger } from "../../utils/logger";
import {
  buildDepositEmail,
  buildExchangeEmail,
  buildWelcomeEmail,
} from "./notifications.templates";
import type {
  DepositNotificationData,
  ExchangeNotificationData,
  NotificationRecipient,
} from "./notifications.types";

export const notificationsService = {
  /**
   * 1. Envía email de agradecimiento y bienvenida tras registrarse en NexPay.
   */
  async sendWelcomeEmail(user: NotificationRecipient): Promise<void> {
    try {
      const email = buildWelcomeEmail(user);
      await sendEmailWithSes({
        to: user.email,
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
      await sendEmailWithSes({
        to: data.user.email,
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
      await sendEmailWithSes({
        to: data.user.email,
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
};
