# Base de datos de NexPay

PostgreSQL en Railway. El esquema vive en este directorio y cambia **solo mediante migraciones**: nadie modifica tablas a mano en Railway sin dejar su archivo aquí.

## Archivos

| Archivo | Qué hace | Estado en Railway |
| --- | --- | --- |
| `schema.sql` | Esquema base: `currencies`, `users`, `wallets`, `balances`, `transactions`, índices y triggers de `updated_at` | Aplicado |
| `migrations/001_google_auth.sql` | Login con Google: columna `users.google_id` (UNIQUE), `password_hash` opcional y regla "contraseña o Google" | Aplicado |
| `migrations/002_demo_deposits.sql` | Recargas: tipo `DEPOSIT` en `transactions` y `from_currency` opcional **solo** en depósitos | Aplicado |
| `migrations/003_add_ars.sql` | Agrega el peso argentino (ARS) y su balance en 0 para las wallets existentes | Aplicado |
| `migrations/004_last_known_rates.sql` | Tabla `last_known_rates`: última tasa válida de cada proveedor, para usarla si Frankfurter o DolarApi fallan | Aplicado |
| `migrations/005_exchange_fees.sql` | Compra/venta/intercambio: columnas `fee_amount`, `fee_currency`, `fee_percent` y `ars_rate_type` en `transactions` | Aplicado |
| `migrations/006_email_notifications.sql` | Historial de correos por usuario, con estado de envío y referencia del proveedor | Aplicado |
| `migrations/007_alert_emails.sql` | Reglas de alertas por usuario y registro de emails de alerta | Aplicado |
| `migrations/008_user_theme.sql` | Preferencia de tema claro/oscuro por usuario para personalizar correos | Aplicado |
| `migrations/009_user_notification_preferences.sql` | Preferencias de alertas y avisos por usuario, persistidas por cuenta | Aplicado |
| `migrations/010_user_notifications.sql` | Historial de notificaciones in-app por usuario y lectura | Aplicado |
| `migrations/013_session_version.sql` | Versión persistente para invalidar sesiones JWT tras recuperar la contraseña | Aplicado |
| `migrations/014_p2p.sql` | Mercado P2P: tabla `p2p_offers` (monto retenido en garantía, tasa, comisión de cada parte), tipo `P2P` en `transactions`, emails `p2p` y reputación (intercambios completados) | Aplicado |

## Reglas que el código debe respetar

- `users.status` solo acepta `active`, `suspended` o `closed`.
- `transactions.type` solo acepta `BUY`, `SELL`, `EXCHANGE`, `DEPOSIT` o `P2P`.
- Una oferta P2P abierta tiene su `sell_amount` fuera del saldo del vendedor (retenido); al cancelarse o vencer vuelve a su saldo, y al aceptarse el intercambio se hace en una sola transacción SQL que bloquea las dos cuentas.
- En un `DEPOSIT`, `from_currency` es `NULL`; en los demás tipos es obligatorio y distinto de `to_currency`.
- `from_amount`, `to_amount` y `exchange_rate` deben ser **mayores que 0**.
- `balances.amount` nunca puede ser negativo.
- Un usuario tiene `password_hash`, `google_id` o ambos (nunca ninguno).
- Las tablas usan `ON DELETE RESTRICT`: wallets, balances y transacciones no se borran.
- Toda operación que modifica `balances` y registra en `transactions` va dentro de **una transacción SQL** (`BEGIN`/`COMMIT`).

## Cómo aplicar una migración

Con `DATABASE_URL` en tu `.env` apuntando a la base (para Railway, la URL pública con `DB_SSL=true`):

```bash
npm run db:sql -- db/migrations/003_add_ars.sql
```

Las migraciones son **idempotentes**: ejecutarlas dos veces no rompe nada.

## Cómo agregar una migración nueva

1. Crea `db/migrations/NNN_descripcion.sql` con el siguiente número.
2. Escríbela idempotente (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) y dentro de `BEGIN; ... COMMIT;`.
3. Súbela en un Pull Request y **avisa al equipo** antes de aplicarla en Railway: la base es compartida.
4. Después de aplicarla, actualiza la tabla de este README.
