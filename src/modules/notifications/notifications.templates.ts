import { env } from "../../config/env";
import type {
  DepositNotificationData,
  ExchangeNotificationData,
  NotificationRecipient,
} from "./notifications.types";

const LIGHT_EMAIL_COLORS: Record<string, string> = {
  "#0a0a0a": "#faf7f0",
  "#12110e": "#ffffff",
  "#050505": "#faf7f0",
  "#eee2c0": "#17140e",
  "#d4a64a": "#7a5510",
  "#1a1206": "#ffffff",
  "#b3a888": "#4a4234",
  "#0e0d0b": "#fffdf8",
  "#3b3020": "#c6b88f",
  "#2e2410": "#fff6e0",
  "#8a6a1f": "#e8b44a",
  "#f2cf7a": "#7a5200",
  "#4cc38a": "#1a7f4b",
  "#163326": "#e4f4eb",
  "#a09683": "#5e5545",
};

function applyLightEmailPalette(html: string): string {
  return html.replace(/style="[^"]*"/g, (styleAttribute) =>
    styleAttribute
      .replace(/#[\da-f]{3,8}/gi, (color) => LIGHT_EMAIL_COLORS[color.toLowerCase()] ?? color)
      .replace("rgba(212, 166, 74, 0.22)", "rgba(122, 85, 16, 0.16)")
      .replace("rgba(0, 0, 0, 0.5)", "rgba(60, 45, 15, 0.1)"),
  );
}

/**
 * Envoltorio común para estilos y estructura de los correos HTML de NexPay.
 */
function emailLayout(title: string, contentHtml: string, theme: "light" | "dark" = "dark"): string {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #eee2c0; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #12110e; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); border: 1px solid #3b3020;" cellspacing="0" cellpadding="0">
          
          <!-- Encabezado con branding NexPay -->
          <tr>
            <td style="background: linear-gradient(135deg, #050505 0%, #12110e 100%); padding: 32px 32px 28px; text-align: center;">
              <div style="display: inline-block;">
                <span style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #eee2c0;">Nex<span style="color: #d4a64a;">Pay</span></span>
              </div>
              <div style="margin-top: 6px; font-size: 13px; font-weight: 500; color: #b3a888; text-transform: uppercase; letter-spacing: 1px;">
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #2e2410; border: 1px solid #8a6a1f; border-radius: 10px; padding: 14px 16px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; color: #f2cf7a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                      Entorno de Demostración &bull; Dinero Ficticio
                    </div>
                    <div style="font-size: 12px; line-height: 1.5; color: #eee2c0;">
                      NexPay opera en modo educativo y de simulación. Todas las operaciones (recargas, compras, ventas o intercambios) se realizan con <strong>saldos ficticios</strong> sin valor comercial ni cargos reales.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pie de página -->
          <tr>
            <td style="background-color: #0e0d0b; border-top: 1px solid #3b3020; padding: 24px 32px; text-align: center; font-size: 12px; color: #b3a888; line-height: 1.6;">
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
  return theme === "light" ? applyLightEmailPalette(html) : html;
}

/**
 * 1. Email de agradecimiento por registrarse (Welcome Email)
 */
export function buildWelcomeEmail(user: NotificationRecipient): { subject: string; html: string; text: string } {
  const subject = "¡Bienvenido a NexPay! Gracias por registrarte";
  const firstName = user.full_name.split(" ")[0] || user.full_name;

  const contentHtml = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #eee2c0;">
      ¡Hola, ${firstName}! 👋
    </h1>
    <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.6; color: #b3a888;">
      Muchas gracias por crear tu cuenta en <strong>NexPay</strong>. Nos alegra darte la bienvenida a nuestra billetera digital multimoneda.
    </p>

    <div style="background-color: #0e0d0b; border: 1px solid #3b3020; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #eee2c0; text-transform: uppercase; letter-spacing: 0.5px;">
        ¿Qué puedes hacer en tu cuenta?
      </h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #b3a888;">
        <li><strong>Billetera multimoneda:</strong> Gestiona saldos en Pesos Colombianos (COP), Pesos Argentinos (ARS), Dólares (USD) y Euros (EUR).</li>
        <li><strong>Cotizaciones en tiempo real:</strong> Consulta tasas oficiales y tipo de cambio para el corredor Colombia &harr; Argentina sin comisiones ocultas.</li>
        <li><strong>Recargas de prueba:</strong> Acredita saldo virtual al instante para practicar todas las operaciones que desees.</li>
        <li><strong>Compra, venta e intercambio:</strong> Convierte entre divisas con cálculo transparente e instantáneo.</li>
      </ul>
    </div>

    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #b3a888;">
      Tu billetera ha sido inicializada y está lista para que comiences a explorar la plataforma de inmediato.
    </p>

    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #d4a64a; color: #1a1206; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(212, 166, 74, 0.22);">
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
    html: emailLayout(subject, contentHtml, user.theme),
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
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Nuevo saldo ${data.from_currency}</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; font-weight: 600; color: #eee2c0; text-align: right;">
          ${formatBalance(data.balances.from, 2)} ${data.from_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Nuevo saldo ${data.to_currency}</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; font-weight: 600; color: #eee2c0; text-align: right;">
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
      <span style="display: inline-block; background-color: #2e2410; color: #f2cf7a; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
        ${operationTitle}
      </span>
    </div>

    <h1 style="margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #eee2c0;">
      ¡Transacción exitosa, ${firstName}!
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #b3a888;">
      Tu operación de <strong>${operationTitle.toLowerCase()}</strong> ha sido procesada y registrada correctamente en tu billetera.
    </p>

    <!-- Tabla de detalles de la transacción -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0e0d0b; border: 1px solid #3b3020; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Monto debitado (origen)</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 14px; font-weight: 700; color: #eee2c0; text-align: right;">
          ${fromAmount} ${data.from_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Monto acreditado (destino)</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 14px; font-weight: 700; color: #4cc38a; text-align: right;">
          +${toAmount} ${data.to_currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Tasa de cambio aplicada</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; font-weight: 600; color: #eee2c0; text-align: right;">
          1 ${data.from_currency} = ${data.rate} ${data.to_currency}${data.ars_rate_type ? ` (${data.ars_rate_type})` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Comisión por operación</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; font-weight: 500; color: #b3a888; text-align: right;">
          ${feeAmount} ${data.from_currency} (${data.fee_percent}%)
        </td>
      </tr>
      ${balancesHtml}
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">ID de Transacción</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 12px; font-family: monospace; color: #a09683; text-align: right;">
          ${data.transaction_id}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; font-size: 13px; color: #b3a888;">Fecha y Hora</td>
        <td style="padding: 12px 18px; font-size: 13px; color: #a09683; text-align: right;">
          ${new Date(data.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #d4a64a; color: #1a1206; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 24px; border-radius: 8px;">
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
    html: emailLayout(subject, contentHtml, data.user.theme),
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
      <span style="display: inline-block; background-color: #163326; color: #4cc38a; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
        Recarga Exitosa
      </span>
    </div>

    <h1 style="margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #eee2c0;">
      ¡Saldo acreditado, ${firstName}! 💰
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #b3a888;">
      Se ha completado con éxito la recarga de saldo simulado en tu billetera NexPay.
    </p>

    <!-- Tabla de detalles de la recarga -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0e0d0b; border: 1px solid #3b3020; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Monto acreditado</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 16px; font-weight: 800; color: #4cc38a; text-align: right;">
          +${formattedAmount} ${data.currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">Nuevo saldo disponible</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 14px; font-weight: 700; color: #eee2c0; text-align: right;">
          ${formattedBalance} ${data.currency}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 13px; color: #b3a888;">ID de Transacción</td>
        <td style="padding: 12px 18px; border-bottom: 1px solid #3b3020; font-size: 12px; font-family: monospace; color: #a09683; text-align: right;">
          ${data.transaction_id}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 18px; font-size: 13px; color: #b3a888;">Fecha y Hora</td>
        <td style="padding: 12px 18px; font-size: 13px; color: #a09683; text-align: right;">
          ${new Date(data.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${env.FRONTEND_URL}" target="_blank" style="display: inline-block; background-color: #d4a64a; color: #1a1206; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 24px; border-radius: 8px;">
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
    html: emailLayout(subject, contentHtml, data.user.theme),
    text,
  };
}

export function buildAlertEmail(data: { user: NotificationRecipient; title: string; message: string }): { subject: string; html: string; text: string } {
  const firstName = data.user.full_name.split(" ")[0] || data.user.full_name;
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
  const title = escapeHtml(data.title);
  const message = escapeHtml(data.message);
  const subject = `${data.title} | Alerta de NexPay`;
  const contentHtml = `
    <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #eee2c0;">Hola, ${escapeHtml(firstName)}</h1>
    <p style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #d4a64a;">${title}</p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #b3a888;">${message}</p>
  `;

  return {
    subject,
    html: emailLayout(title, contentHtml, data.user.theme),
    text: `Hola, ${firstName}\n\n${data.title}\n${data.message}\n\nHas recibido este correo porque activaste el email para esta alerta en NexPay.`,
  };
}
