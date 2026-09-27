/**
 * Redondea un número a `decimals` posiciones.
 * Solo se usa para valores informativos (tasas, cotizaciones y valorizaciones);
 * los saldos reales se guardan y devuelven como NUMERIC/string desde PostgreSQL.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Redondea a `digits` cifras significativas. Sirve para tasas de cualquier tamaño:
 * 1 COP = 0.00030550209 USD → 0.0003055021; 1 USD = 3273.30000001 COP → 3273.3.
 */
export function roundSignificant(value: number, digits = 8): number {
  return value === 0 ? 0 : Number(value.toPrecision(digits));
}
