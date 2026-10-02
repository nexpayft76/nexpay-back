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
function explainAwsSesError(error: unknown): { code: string; message: string } {
  const value = error instanceof Error ? error.message : String(error);
  const normalized = value.toLowerCase();

  if (normalized.includes("email address not verified") || normalized.includes("identity not verified")) {
    return {
      code: "AWS_SES_IDENTITY_NOT_VERIFIED",
      message: "La identidad remitente de SES no está verificada en AWS. Verifica el email o dominio configurado en SES.",
    };
  }

  if (normalized.includes("not authorized") || normalized.includes("access denied") || normalized.includes("forbidden")) {
    return {
      code: "AWS_SES_PERMISSION_DENIED",
      message: "La cuenta de AWS no tiene permisos para enviar por SES. Revisa el IAM y el usuario asociado.",
    };
  }

  if (normalized.includes("invalid client token") || normalized.includes("signature does not match")) {
    return {
      code: "AWS_SES_INVALID_CREDENTIALS",
      message: "Las credenciales de AWS no son válidas o expiraron. Revisa AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY.",
    };
  }

  return {
    code: "AWS_SES_SEND_FAILED",
    message: value,
  };
}

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
    const parsed = explainAwsSesError(error);
    logger.error("Error al enviar email a través de AWS SES", {
      code: parsed.code,
      hint: parsed.message,
      to: payload.to,
      subject: payload.subject,
    });

    return {
      success: false,
      error: parsed.code,
    };
  }
}
