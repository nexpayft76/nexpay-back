# NexPay · API

API de **NexPay**, una billetera digital multimoneda (COP, ARS, USD y EUR) con foco en el corredor
**Colombia ↔ Argentina**: recargar saldo, cotizar, cambiar monedas dentro de la cuenta (intercambio de balance)
y cambiar con otros usuarios en un **mercado P2P**, viendo siempre la tasa real y la comisión antes de confirmar.

- **API en producción:** https://nexpay-back-production.up.railway.app
- **Documentación interactiva (Swagger):** https://nexpay-back-production.up.railway.app/docs
- **Front:** https://nexpay-front.vercel.app · repo [`nexpay-front`](https://github.com/nexpayft76/nexpay-front)

> Proyecto final del bootcamp de Henry. Las operaciones usan **dinero ficticio** (modo demo).

---

## Stack

| Área | Tecnología |
| --- | --- |
| Runtime | Node.js ≥ 20, TypeScript |
| Servidor | Express 5 |
| Base de datos | PostgreSQL (`pg`, SQL directo, transacciones con `BEGIN`/`COMMIT`) |
| Validación | zod |
| Autenticación | JWT (HS256) en cookie **HttpOnly**, contraseñas con bcrypt |
| Emails | AWS SES (con registro de cada envío en la base) |
| Asistente con IA | OpenRouter (modelos gratis, con cambio automático si uno se queda sin cupo) |
| Documentación | swagger-jsdoc + swagger-ui-express |
| Tests | `node:test` + tsx (unitarios y de integración) |
| Deploy | Railway (API + PostgreSQL) |

Tasas de cambio (sin API key):
- **Frankfurter v2**: USD, EUR y COP (tasa oficial diaria de bancos centrales).
- **DolarApi**: dólar oficial, MEP y blue en Argentina (compra y venta, en vivo).
- **ArgentinaDatos**: historial del dólar en Argentina (para los gráficos).

---

## Funcionalidades

- **Cuenta y sesión:**
  - registro, login y logout con la sesión en una cookie HttpOnly (el JavaScript de la página no puede leer el token);
  - email disponible en tiempo real y límite de intentos por IP (login 10/min, registro 5/min);
  - recuperar la contraseña por email (enlace de un solo uso que vence en 1 hora) y cambiarla con la sesión iniciada;
  - editar nombre y email, y cerrar la propia cuenta (exige saldos en 0).
- **Billetera:** saldo por moneda y total estimado en la moneda elegida.
- **Recarga** de dinero ficticio, con límite por moneda.
- **Intercambio de balance** (cambiar una moneda por otra dentro de la cuenta):
  - la tasa la calcula el servidor, nunca el cliente;
  - comisión de **0,05%** por defecto, que el superusuario puede cambiar;
  - todo en una transacción SQL: sin saldos negativos ni operaciones a medias.
- **Mercado P2P** entre usuarios:
  - el vendedor publica una oferta a su propia tasa (máximo ±10% de la tasa actual) y el monto queda **retenido en garantía**;
  - otro usuario la acepta y el intercambio es **instantáneo y atómico**: se bloquean las dos cuentas mientras se ejecuta y o pasa todo o no pasa nada;
  - cada parte paga una comisión (0,5% por defecto) sobre lo que recibe;
  - las ofertas se pueden cancelar y vencen a las 72 h (el dinero retenido vuelve al vendedor);
  - **reputación**: número de intercambios completados de cada usuario;
  - en el mercado solo se muestra el nombre y la inicial del apellido.
- **Historiales:** movimientos de la cuenta (recargas e intercambios de balance) e intercambios P2P aceptados, paginados.
- **Roles y panel del superusuario:**
  - solo dos roles: **usuario** (todo el que se registra) y **superusuario**;
  - una **cuenta propietaria** (superusuario) recibe en su billetera **todas las comisiones, en la moneda exacta en que se cobraron**, dentro de la misma transacción de cada operación;
  - el superusuario ve y busca usuarios por correo, asigna roles, suspende o reactiva cuentas (al suspender se cierran sus sesiones), ve todas las transacciones, todo el P2P y las comisiones, y cambia los porcentajes de comisión.
- **Avisos:**
  - emails con AWS SES: bienvenida, recarga, intercambio de balance, P2P (publicada, vendida, comprada, cancelada y vencida), alertas, contraseña cambiada y recuperación;
  - notificaciones dentro de la app y alertas configurables (tasa objetivo, cambio diario, saldo bajo, recarga recibida);
  - preferencias por usuario: tema claro u oscuro y avisos por app o por email.
- **Asistente Nexa (IA):** responde dudas de NexPay, tasas y la cuenta del usuario (solo lectura). **Nunca ejecuta operaciones.** Los visitantes de la landing pueden usarlo sin sesión, solo con información pública.
- **Tasas:** tabla de tasas, conversión, cotizaciones del dólar en Argentina e historial para gráficos, con caché y respaldo de la última tasa válida si un proveedor falla.
- **Seguridad:**
  - CORS con lista de orígenes y protección CSRF (SameSite + verificación de origen);
  - cabeceras de seguridad (CSP, HSTS, X-Frame-Options…) y `no-store` en la API;
  - permisos validados en el back: el rol se lee de la base en cada petición;
  - límites por usuario en las operaciones con dinero y en el asistente.
- **Logs:** una línea por petición con `request_id` (cabecera `X-Request-Id`), en JSON en producción.

### Tipos de transacción

| Tipo en la base | Qué es |
| --- | --- |
| `DEPOSIT` | Recarga |
| `BUY`, `SELL`, `EXCHANGE` | Intercambio de balance (se guardan por separado según la dirección: local → fuerte, fuerte → local o entre iguales) |
| `P2P` | Intercambio con otro usuario (una transacción para cada parte) |

Cuando participa ARS se usa el dólar **oficial** o **MEP** (el blue es solo referencia). Recibir ARS usa el
precio de **compra**; pagar con ARS, el de **venta**.

---

## Endpoints principales

La lista completa, con ejemplos, está en **`/docs`**.

| Método | Ruta | Sesión | Descripción |
| --- | --- | --- | --- |
| GET | `/health` | — | Estado del servidor y de la base |
| POST | `/api/auth/register` | — | Crear cuenta (deja la sesión iniciada) |
| POST | `/api/auth/login` | — | Iniciar sesión |
| POST | `/api/auth/logout` | opcional | Cerrar sesión (nunca responde 401) |
| GET | `/api/auth/session` | opcional | Sesión actual o `null` (siempre 200), con el rol del usuario |
| GET | `/api/auth/email-available?email=` | — | ¿Email libre? (máx. 20/min por IP) |
| POST | `/api/auth/password-reset/request` · `/confirm` | — | Recuperar la contraseña por email |
| PATCH | `/api/users/me` · `/me/password` · `/me/preferences` | ✔ | Editar perfil, cambiar contraseña, preferencias |
| DELETE | `/api/users/me` | ✔ | Cerrar mi cuenta (pide la contraseña y saldos en 0) |
| GET | `/api/rates` · `/convert` · `/ars` · `/history` | — | Tasas, conversión, dólar en Argentina e historial |
| GET | `/api/wallets/me?valued_in=USD` | ✔ | Mi billetera y total estimado |
| POST | `/api/wallets/me/deposits` | ✔ | Recarga ficticia |
| GET | `/api/transactions/me/exchange/quote` | ✔ | Cotización exacta del intercambio de balance (no mueve saldos) |
| POST | `/api/transactions/me/exchange` | ✔ | Intercambio de balance |
| GET | `/api/transactions/me?type=DEPOSIT\|EXCHANGE` | ✔ | Historial de mi cuenta, paginado |
| GET | `/api/p2p/quote` | ✔ | Simular una oferta: tasa actual, rango, comisión y lo que recibe cada parte |
| GET · POST | `/api/p2p/offers` | ✔ | Mercado (ofertas de otros) · publicar una oferta |
| GET | `/api/p2p/offers/me` | ✔ | Mis ofertas |
| POST | `/api/p2p/offers/:id/accept` · `/cancel` | ✔ | Aceptar (instantáneo) · cancelar (devuelve lo retenido) |
| GET | `/api/p2p/trades/me` | ✔ | Mis intercambios P2P aceptados |
| GET · POST · PATCH · DELETE | `/api/alerts` · `/api/notifications` | ✔ | Alertas y notificaciones dentro de la app |
| POST | `/api/assistant/public/chat` | — | Nexa para visitantes (información pública) |
| POST | `/api/assistant/chat` | ✔ | Nexa con los datos de mi cuenta (solo lectura) |
| GET | `/api/superuser/users?email=` | superusuario | Usuarios registrados, con búsqueda por correo |
| PATCH | `/api/superuser/users/:id/role` · `/status` | superusuario | Asignar rol · suspender o reactivar |
| GET | `/api/superuser/fees/summary` · `/fees` | superusuario | Comisiones cobradas y saldo de la billetera propietaria |
| GET · PATCH | `/api/superuser/settings/fees` | superusuario | Ver y cambiar los porcentajes de comisión |
| GET | `/api/superuser/transactions` · `/p2p/offers` | superusuario | Todas las transacciones y ofertas del sistema |
| GET/PATCH/DELETE | `/api/users`, `/api/wallets`, `/api/balances`, `/api/transactions`, `/api/currencies` | superusuario | CRUD de administración |

Formato de las respuestas:
- éxito → `{ "data": ... }`
- error → `{ "error": "CODIGO", "message": "...", "details": [{ "path", "message" }] }`

---

## Base de datos

13 tablas en PostgreSQL. El centro del modelo es `wallets` (una por usuario): de ella cuelgan saldos,
transacciones, ofertas P2P y comisiones. Todo cambio de esquema es una migración en `db/migrations/`; las reglas
de la base y el estado de cada migración están en [`db/README.md`](db/README.md).

| Grupo | Tablas |
| --- | --- |
| Identidad | `users`, `password_reset_tokens` |
| Dinero | `currencies`, `wallets`, `balances`, `transactions` |
| P2P | `p2p_offers` |
| Plataforma | `platform_fees` (cada comisión cobrada), `platform_settings` (porcentajes de comisión) |
| Avisos | `user_alerts`, `user_notifications`, `email_notifications` |
| Tasas | `last_known_rates` (respaldo si un proveedor falla) |

---

## Caché de tasas

| Tasa | Proveedor | Se renueva cada |
| --- | --- | --- |
| USD, EUR, COP | Frankfurter | 1 hora (publica una vez por día hábil) |
| ARS | DolarApi | 5 minutos |
| Historial | ArgentinaDatos / Frankfurter | 6 horas |

Si un proveedor falla, se usa la última tasa válida (en memoria o en la tabla `last_known_rates`) y la
respuesta lo avisa en `warnings`. Se reintenta como máximo una vez por minuto.

---

## Estructura

```
src/
├── app.ts                 # Express: middlewares, CORS, rutas, errores
├── index.ts               # Arranque del servidor
├── config/                # env (validado con zod), db (pool + transacciones), cors, swagger
├── integrations/          # Frankfurter, DolarApi, ArgentinaDatos, AWS SES y OpenRouter
├── middlewares/           # errores, logger de peticiones, límite de peticiones, cabeceras de seguridad
├── modules/               # Un módulo por dominio
│   ├── auth/              #   registro, login, sesión, recuperación de contraseña, requireAuth / requireSuperuser
│   ├── users/             #   mi perfil, contraseña, preferencias y cierre de cuenta (+ CRUD de administración)
│   ├── wallets/           #   billetera /me y recargas
│   ├── transactions/      #   intercambio de balance e historial de la cuenta
│   ├── p2p/               #   mercado P2P: ofertas, garantía, aceptación atómica e historial
│   ├── treasury/          #   comisiones a la billetera propietaria
│   ├── settings/          #   porcentajes de comisión que decide el superusuario
│   ├── superuser/         #   panel del superusuario
│   ├── rates/             #   tasas, conversión e historial
│   ├── alerts/, notifications/   # alertas, avisos en la app y emails
│   ├── assistant/         #   Nexa (IA, solo lectura)
│   └── balances, currencies/     # CRUD de administración
│       └── <x>.routes.ts · <x>.controller.ts · <x>.service.ts · <x>.repository.ts · <x>.middlewares.ts
└── utils/                 # AppError, logger, caché con respaldo, redondeo de montos
db/
├── schema.sql             # Esquema base
├── migrations/            # 001…016 (ver db/README.md)
└── README.md              # Reglas de la base y cómo aplicar migraciones
scripts/                   # db:sql (ejecutar SQL) y db:superuser (crear la cuenta propietaria)
tests/                     # unitarios e integración (node:test)
```

---

## Cómo correrlo en local

Requisitos: **Node.js 20+** y una base **PostgreSQL** (local o la de Railway).

```bash
git clone https://github.com/nexpayft76/nexpay-back.git
```

```bash
cd nexpay-back
```

```bash
npm install
```

Copia `.env.example` como `.env` y completa los valores (ver la tabla de abajo).

Si la base es nueva, aplica el esquema y las migraciones en orden (`db/schema.sql` y luego `db/migrations/001` a `016`):

```bash
npm run db:sql -- db/schema.sql db/migrations/001_google_auth.sql db/migrations/002_demo_deposits.sql db/migrations/003_add_ars.sql db/migrations/004_last_known_rates.sql db/migrations/005_exchange_fees.sql db/migrations/006_email_notifications.sql db/migrations/007_alert_emails.sql db/migrations/008_user_theme.sql db/migrations/009_user_notification_preferences.sql db/migrations/010_user_notifications.sql db/migrations/011_password_changed_email.sql db/migrations/012_password_reset.sql db/migrations/013_session_version.sql db/migrations/014_p2p.sql db/migrations/015_roles_tesoreria.sql db/migrations/016_platform_settings.sql
```

Crea la cuenta propietaria (superusuario que recibe las comisiones). En PowerShell, con tus propios datos:

```powershell
$env:SUPERUSER_EMAIL="tu-correo@ejemplo.com"; $env:SUPERUSER_PASSWORD="TuClaveSegura123"; $env:SUPERUSER_NAME="NexPay"; npm run db:superuser
```

Levanta la API en modo desarrollo (se recarga sola al guardar):

```bash
npm run dev
```

API en http://localhost:3000 · Swagger en http://localhost:3000/docs

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor en desarrollo (tsx watch) |
| `npm run build` | Compila a `dist/` |
| `npm start` | Corre la versión compilada |
| `npm run typecheck` | Revisa tipos sin compilar |
| `npm test` | 137 tests unitarios y de integración (sin base de datos: los repositorios se simulan) |
| `TEST_DATABASE_URL=postgresql://…/nexpay_test npm test` | Además corre los tests contra una PostgreSQL real y descartable (con `db/schema.sql` y las migraciones aplicadas). El nombre de la base debe incluir `test` |
| `npm run db:sql -- <archivo.sql>` | Ejecuta SQL contra `DATABASE_URL` |
| `npm run db:superuser` | Crea la cuenta propietaria con `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD` y `SUPERUSER_NAME` del entorno (nunca se guardan en el repo) |

---

## Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✔ | — | Conexión a PostgreSQL |
| `JWT_SECRET` | ✔ | — | Secreto para firmar los JWT (mín. 32 caracteres) |
| `FRONTEND_URL` | ✔ | — | Orígenes permitidos por CORS, separados por coma (admite `*` para previews de Vercel) |
| `FRONTEND_APP_URL` | | `https://nexpay-front.vercel.app/` | URL del front para los enlaces de los emails |
| `NODE_ENV` | | `development` | `production` activa cookies `Secure`, HSTS y logs en JSON |
| `PORT` | | `3000` | Puerto HTTP (Railway lo define solo) |
| `DB_SSL` | | según `NODE_ENV` | SSL hacia PostgreSQL |
| `JWT_EXPIRES_IN` | | `1h` | Duración de la sesión (`15m`, `1h`, `7d`…) |
| `RATES_CACHE_TTL_SECONDS` | | `3600` | Caché de Frankfurter |
| `ARS_RATES_CACHE_TTL_SECONDS` | | `300` | Caché de DolarApi |
| `HISTORY_CACHE_TTL_SECONDS` | | `21600` | Caché del historial |
| `DEMO_DEPOSITS_ENABLED` | | `true` | Permite recargas ficticias |
| `EXCHANGE_FEE_PERCENT` | | `0.05` | Comisión inicial del intercambio de balance, en % del monto de origen (luego la cambia el superusuario desde su panel) |
| `P2P_FEE_PERCENT` | | `0.5` | Comisión inicial P2P que paga cada parte, en % de lo que recibe (luego la cambia el superusuario) |
| `P2P_MAX_RATE_DEVIATION_PERCENT` | | `10` | Cuánto puede alejarse la tasa de una oferta P2P de la del mercado (±%) |
| `P2P_OFFER_TTL_HOURS` | | `72` | Horas que dura una oferta P2P abierta antes de vencer |
| `P2P_MAX_OPEN_OFFERS` | | `5` | Ofertas P2P abiertas por usuario a la vez |
| `AWS_REGION` | | `us-east-2` | Región de AWS SES |
| `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` | | — | Credenciales de AWS SES (sin ellas no se envían emails; la API sigue funcionando) |
| `SES_FROM_EMAIL` | | `nexpay.team@gmail.com` | Remitente verificado en SES |
| `OPENROUTER_API_KEY` | | — | Key de OpenRouter para Nexa (sin ella, Nexa responde "no disponible") |
| `OPENROUTER_MODELS` | | 4 modelos gratis | Modelos en orden de preferencia, separados por coma |

> Nunca subas el archivo `.env` al repositorio ni pegues keys o contraseñas en el código.

---

## Flujo de trabajo del equipo

- `main` está protegida: todo entra por Pull Request con 1 aprobación, sin force push.
- Una rama por cambio (`feat/…`, `fix/…`, `docs/…`), **squash merge** y borrar la rama al mergear.
- Los cambios de base de datos van **solo** como migración en `db/migrations/` (ver `db/README.md`), y se aplican antes de desplegar el código que los usa.
- Mensajes de commit en español con el formato `tipo(área): descripción`.

## Equipo

| Integrante | Rol |
| --- | --- |
| William Coral | Líder técnico · auth, tasas, billetera, intercambio de balance, P2P, superusuario y tesorería, Nexa; revisión e integración |
| Nelson Arzuza | Back · CRUD, emails con AWS SES, notificaciones, recuperación de contraseña, Swagger y tests del back |
| Raúl Alejandro Carmona (Alejo) | Conexión front ↔ back, sesión, navegación, responsive y tests |
| Tamara | Diseño visual del front, perfil de usuario (editar, cambiar contraseña, cerrar cuenta) y tests end to end |
