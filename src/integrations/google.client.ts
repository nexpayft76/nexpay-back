import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { env } from "../config/env";
import { AppError } from "../utils/app-error";

export interface GoogleProfile {
  googleId: string;
  email: string;
  fullName: string;
}

const client = new OAuth2Client();

/**
 * Verifica el ID token que el front recibió de Google:
 * firma válida (claves públicas de Google), no expirado, emitido por Google
 * y dirigido a NUESTRO Client ID (audience). Solo acepta emails verificados.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(503, "GOOGLE_AUTH_DISABLED", "El inicio de sesión con Google no está configurado");
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(401, "INVALID_GOOGLE_TOKEN", "El token de Google no es válido o expiró");
  }

  if (!payload?.sub || !payload.email) {
    throw new AppError(401, "INVALID_GOOGLE_TOKEN", "El token de Google no contiene los datos necesarios");
  }
  if (payload.email_verified !== true) {
    throw new AppError(401, "GOOGLE_EMAIL_NOT_VERIFIED", "El email de la cuenta de Google no está verificado");
  }

  const email = payload.email.trim().toLowerCase();
  const fullName = (payload.name ?? email.split("@")[0] ?? "Usuario").trim().slice(0, 120);
  return { googleId: payload.sub, email, fullName };
}
