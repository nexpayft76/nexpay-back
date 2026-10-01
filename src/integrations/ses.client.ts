import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let clientInstance: SESClient | null = null;

function getSesClient(): SESClient | null {
  if (!env.aws.isConfigured) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = new SESClient({
      region: env.aws.region,
      credentials: {
        accessKeyId: env.aws.accessKeyId!,
        secretAccessKey: env.aws.secretAccessKey!,
      },
    });
  }

  return clientInstance;
}

/**
 * Envía un correo electrónico a través de AWS SES.
 * Si AWS SES no está configurado (por ejemplo, en desarrollo sin credenciales),
 * simula el envío registrándolo en los logs sin interrumpir la operación del usuario.
 */
export async function sendEmailWithSes(payload: SendEmailPayload): Promise<SendEmailResult> {
  const client = getSesClient();

  if (!client) {
    logger.info("[AWS SES SIMULADO] Email no enviado a AWS (credenciales no configuradas)", {
      to: payload.to,
      subject: payload.subject,
    });
    return { success: false, error: "AWS_SES_NOT_CONFIGURED" };
  }

  try {
    const command = new SendEmailCommand({
      Source: `NexPay <${env.aws.fromEmail}>`,
      Destination: {
        ToAddresses: [payload.to],
      },
      Message: {
        Subject: {
          Data: payload.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: payload.html,
            Charset: "UTF-8",
          },
          Text: {
            Data: payload.text,
            Charset: "UTF-8",
          },
        },
      },
    });

    const response = await client.send(command);

    logger.info("Email enviado exitosamente mediante AWS SES", {
      to: payload.to,
      subject: payload.subject,
      messageId: response.MessageId,
    });

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error al enviar email a través de AWS SES", {
      error: errorMessage,
      to: payload.to,
      subject: payload.subject,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
