import { env } from "../../config/env";
import type {
  DepositNotificationData,
  ExchangeNotificationData,
  NotificationRecipient,
} from "./notifications.types";

/**
 * Envoltorio común para estilos y estructura de los correos HTML de NexPay.
 */
function emailLayout(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          
          <!-- Encabezado con branding NexPay -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 32px 28px; text-align: center;">
              <div style="display: inline-block;">
                <span style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">Nex<span style="color: #38bdf8;">Pay</span></span>
              </div>
              <div style="margin-top: 6px; font-size: 13px; font-weight: 500; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">
                Billetera Digital Multimoneda
              </div>
            </td>
          </tr>

          <!-- Contenido Principal -->
          <tr>
            <td style="padding: 36px 32px 28px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Aviso de Dinero Ficticio (Mandatorio en toda notificación) -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 10px; padding: 14px 16px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                      Entorno de Demostración &bull; Dinero Ficticio
                    </div>
                    <div style="font-size: 12px; line-height: 1.5; color: #713f12;">
                      NexPay opera en modo educativo y de simulación. Todas las operaciones (recargas, compras, ventas o intercambios) se realizan con <strong>saldos ficticios</strong> sin valor comercial ni cargos reales.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pie de página -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
              <div style="margin-bottom: 8px;">
                Has recibido este correo electrónico porque estás registrado en la plataforma NexPay.
              </div>
              <div>
                &copy; ${new Date().getFullYear()} NexPay &bull; Corredor Colombia &harr; Argentina
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Email de agradecimiento por registrarse (Welcome Email)
 */
export function buildWelcomeEmail(user: NotificationRecipient): { subject: string; html: string; text: string } {
  const subject = "¡Bienvenido a NexPay! Gracias por registrarte";
  const firstName = user.full_name.split(" ")[0] || user.full_name;

  const contentHtml = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #0f172a;">
      ¡Hola, ${firstName}! 👋
    </h1>
    <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.6; color: #334155;">
      Muchas gracias por crear tu cuenta en <strong>NexPay</strong>. Nos alegra darte la bienvenida a nuestra billetera digital multimoneda.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
        ¿Qué puedes hacer en tu cuenta?
      </h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #475569;">
        <li><strong>Billetera multimoneda:</strong> Gestiona saldos en Pesos Colombianos (COP), Pesos Argentinos (ARS), Dólares (USD) y Euros (EUR).</li>
        <li><strong>Cotizaciones en tiempo real:</strong> Consulta tasas oficiales y tipo de cambio para el corredor Colombia &harr; Argentina sin comisiones ocultas.</li>
        <li><strong>Recargas de prueba:</strong> Acredita saldo virtual al instante para practicar todas las operaciones que desees.</li>
        <li><strong>Compra, venta e intercambio:</strong> Convierte entre divisas con cálculo transparente e instantáneo.</li>
      </ul>
    </div>

    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
      Tu billetera ha sido inicializada y está lista para que comiences a explorar la plataforma de inmediato.
    </p>

    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);">
        Ingresar a mi Billetera
      </a>
    </div>
  `;

  const text = `¡Hola, ${firstName}!

Muchas gracias por registrarte en NexPay, tu billetera digital multimoneda para el corredor Colombia - Argentina.

Con tu nueva cuenta puedes:
- Gestionar saldos en COP, ARS, USD y EUR.
- Consultar cotizaciones en tiempo real.
- Recargar saldo de prueba para experimentar sin riesgo.
- Comprar, vender e intercambiar divisas al instante.

ACCEDE A TU CUENTA:
${env.FRONTEND_URL}

AVISO DE SIMULACIÓN:
Recuerda que en NexPay todas las operaciones y saldos son 100% ficticios en modo de demostración. No se maneja ni se requiere dinero real.

© ${new Date().getFullYear()} NexPay`;

  return {
    subject,
    html: emailLayout(subject, contentHtml),
    text,
  };
}

/**
 * Limita los decimales a 2 al mostrar cualquier saldo o monto monetario en el correo.
 * Ejemplo: "1500000.4567" -> "1500000.46", "100" -> "100.00"
 */
export function formatBalance(value: string | number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === "") return "0.00";
  const normalized = typeof value === "string" ? value.trim().replace(/,/g, "") : value;
  const num = typeof normalized === "number" ? normalized : Number(normalized);
  if (Number.isNaN(num)) return String(value);
  return num.toFixed(decimals);
}

/**
 * 2. Email de resumen de transacción (Compra / Venta / Intercambio)
 */
export function buildExchangeEmail(data: ExchangeNotificationData): { subject: string; html: string; text: string } {
  const typeLabels: Record<string, string> = {
    BUY: "Compra de Divisa",
    SELL: "Venta de Divisa",
    EXCHANGE: "Intercambio de Monedas",
  };
  const operationTitle = typeLabels[data.type] ?? "Transacción";
  const subject = `Resumen de tu transacción: ${operationTitle} en NexPay`;
  const firstName = data.user.full_name.split(" ")[0] || data.user.full_name;

  const fromAmount = formatBalance(data.from_amount, 2);
  const toAmount = formatBalance(data.to_amount, 2);
  const feeAmount = formatBalance(data.fee_amount, 2);

  const balancesHtml = data.balances
    ? `
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Nuevo saldo ${data.from_currency}</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">
          ${formatBalance(data.balances.from, 2)} ${data.from_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Nuevo saldo ${data.to_currency}</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">
          ${formatBalance(data.balances.to, 2)} ${data.to_currency}
        </td>
      </tr>
    `
    : "";

  const balancesText = data.balances
    ? `\n- Nuevo saldo ${data.from_currency}: ${formatBalance(data.balances.from, 2)} ${data.from_currency}\n- Nuevo saldo ${data.to_currency}: ${formatBalance(data.balances.to, 2)} ${data.to_currency}`
    : "";

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
        ${operationTitle}
      </span>
    </div>

    <h1 style="margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #0f172a;">
      ¡Transacción exitosa, ${firstName}!
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
      Tu operación de <strong>${operationTitle.toLowerCase()}</strong> ha sido procesada y registrada correctamente en tu billetera.
    </p>

    <!-- Tabla de detalles de la transacción -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Monto debitado (origen)</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">
          ${fromAmount} ${data.from_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Monto acreditado (destino)</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #166534; text-align: right;">
          +${toAmount} ${data.to_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Tasa de cambio aplicada</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">
          1 ${data.from_currency} = ${data.rate} ${data.to_currency}${data.ars_rate_type ? ` (${data.ars_rate_type})` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Comisión por operación</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #64748b; text-align: right;">
          ${feeAmount} ${data.from_currency} (${data.fee_percent}%)
        </td>
      </tr>
      ${balancesHtml}
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">ID de Transacción</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-family: monospace; color: #475569; text-align: right;">
          ${data.transaction_id}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">Fecha y Hora</td>
        <td style="padding: 12px 18px; font-size: 13px; color: #475569; text-align: right;">
          ${new Date(data.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 24px; border-radius: 8px;">
        Ver en mi Billetera
      </a>
    </div>
  `;

  const text = `Hola, ${firstName}.

Resumen de tu transacción en NexPay: ${operationTitle}

DETALLES:
- Tipo: ${operationTitle}
- Monto debitado: ${fromAmount} ${data.from_currency}
- Monto acreditado: +${toAmount} ${data.to_currency}
- Tasa de cambio: 1 ${data.from_currency} = ${data.rate} ${data.to_currency}${data.ars_rate_type ? ` (${data.ars_rate_type})` : ""}
- Comisión: ${feeAmount} ${data.from_currency} (${data.fee_percent}%)${balancesText}
- ID de Transacción: ${data.transaction_id}
- Fecha: ${data.created_at}

AVISO DE SIMULACIÓN:
Esta transacción fue realizada con dinero ficticio en el entorno de pruebas de NexPay. No involucra dinero real.

© ${new Date().getFullYear()} NexPay`;

  return {
    subject,
    html: emailLayout(subject, contentHtml),
    text,
  };
}

/**
 * 3. Email de resumen de recarga de saldo ficticio (Deposit Email)
 */
export function buildDepositEmail(data: DepositNotificationData): { subject: string; html: string; text: string } {
  const formattedAmount = formatBalance(data.amount, 2);
  const formattedBalance = formatBalance(data.new_balance, 2);
  const subject = `Resumen de recarga: +${formattedAmount} ${data.currency} en tu billetera NexPay`;
  const firstName = data.user.full_name.split(" ")[0] || data.user.full_name;

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; background-color: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
        Recarga Exitosa
      </span>
    </div>

    <h1 style="margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #0f172a;">
      ¡Saldo acreditado, ${firstName}! 💰
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
      Se ha completado con éxito la recarga de saldo simulado en tu billetera NexPay.
    </p>

    <!-- Tabla de detalles de la recarga -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Monto acreditado</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 16px; font-weight: 800; color: #166534; text-align: right;">
          +${formattedAmount} ${data.currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Nuevo saldo disponible</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">
          ${formattedBalance} ${data.currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">ID de Transacción</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-family: monospace; color: #475569; text-align: right;">
          ${data.transaction_id}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">Fecha y Hora</td>
        <td style="padding: 12px 18px; font-size: 13px; color: #475569; text-align: right;">
          ${new Date(data.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 24px; border-radius: 8px;">
        Ver Saldo en Billetera
      </a>
    </div>
  `;

  const text = `¡Hola, ${firstName}!

Se ha completado con éxito la recarga de saldo simulado en tu billetera NexPay.

DETALLES DE LA RECARGA:
- Monto acreditado: +${formattedAmount} ${data.currency}
- Nuevo saldo disponible: ${formattedBalance} ${data.currency}
- ID de Transacción: ${data.transaction_id}
- Fecha: ${data.created_at}

AVISO DE SIMULACIÓN:
Esta recarga corresponde a saldo virtual de prueba (modo demo) en la plataforma NexPay. No tiene costo monetario ni representa fondos reales.

© ${new Date().getFullYear()} NexPay`;

  return {
    subject,
    html: emailLayout(subject, contentHtml),
    text,
  };
}
