# Base de datos de NexPay

PostgreSQL en Railway. El esquema vive en este directorio y cambia **solo mediante migraciones**: nadie modifica tablas a mano en Railway sin dejar su archivo aquí.

## Archivos

| Archivo | Qué hace | Estado en Railway |
| --- | --- | --- |
| `schema.sql` | Esquema base: `currencies`, `users`, `wallets`, `balances`, `transactions`, índices y triggers de `updated_at` | Aplicado |
| `migrations/001_google_auth.sql` | Login con Google: columna `users.google_id` (UNIQUE), `password_hash` opcional y regla "contraseña o Google" | Aplicado |
| `migrations/002_demo_deposits.sql` | Recargas: tipo `DEPOSIT` en `transactions` y `from_currency` opcional **solo** en depósitos | Aplicado |
| `migrations/003_add_ars.sql` | Agrega el peso argentino (ARS) y su balance en 0 para las wallets existentes | Aplicado |

## Reglas que el código debe respetar

- `users.status` solo acepta `active`, `suspended` o `closed`.
- `transactions.type` solo acepta `BUY`, `SELL`, `EXCHANGE` o `DEPOSIT`.
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
