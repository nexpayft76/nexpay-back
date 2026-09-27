/**
 * Redondea un número a `decimals` posiciones.
 * Solo se usa para valores informativos (tasas, cotizaciones y valorizaciones);
 * los saldos reales se guardan y devuelven como NUMERIC/string desde PostgreSQL.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
