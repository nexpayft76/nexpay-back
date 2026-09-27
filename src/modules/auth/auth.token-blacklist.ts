/**
 * Tokens revocados por logout, guardados en memoria.
 *
 * Un JWT no se puede "borrar": sigue siendo válido hasta que expira. Para que el logout
 * lo invalide de verdad, guardamos su `jti` hasta la fecha de expiración.
 * Limitación conocida: se vacía si el servidor se reinicia (los tokens duran poco, ej. 1h).
 * Con varias instancias del servidor habría que moverlo a Redis o a una tabla.
 */
const revoked = new Map<string, number>(); // jti -> expiración en ms

function purgeExpired(now: number): void {
  for (const [jti, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(jti);
  }
}

export function revokeToken(jti: string, expSeconds: number): void {
  purgeExpired(Date.now());
  revoked.set(jti, expSeconds * 1000);
}

export function isTokenRevoked(jti: string): boolean {
  const expiresAt = revoked.get(jti);
  return expiresAt !== undefined && expiresAt > Date.now();
}
