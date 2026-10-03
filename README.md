# NexPay · API

API de **NexPay**, una billetera digital multimoneda (COP, ARS, USD y EUR) con foco en el corredor
**Colombia ↔ Argentina**: recargar saldo, cotizar y comprar, vender o intercambiar monedas viendo la
tasa real y el costo antes de confirmar.

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
| Documentación | swagger-jsdoc + swagger-ui-express |
| Deploy | Railway (API + PostgreSQL) |

Tasas de cambio (sin API key):
- **Frankfurter v2**: USD, EUR y COP (tasa oficial diaria de bancos centrales).
- **DolarApi**: dólar oficial, MEP y blue en Argentina (compra y venta, en vivo).
- **ArgentinaDatos**: historial del dólar en Argentina (para los gráficos).

---

## Funcionalidades

- **Autenticación:** registro, login, logout y sesión en cookie HttpOnly (el JavaScript de la página no puede leer el token).
  - Consulta en tiempo real de email disponible.
  - Límite de intentos por IP (login 10/min, registro 5/min).
- **Billetera (`/me`):** saldo por moneda y total estimado en la moneda elegida.
- **Recarga** de dinero ficticio, con límite por moneda.
- **Compra, venta e intercambio** entre monedas:
  - la tasa la calcula el servidor (nunca el cliente);
  - comisión configurable;
  - todo en una transacción SQL (sin saldos negativos ni operaciones a medias).
- **Tasas:** tabla de tasas, conversión, cotizaciones del dólar en Argentina e historial para gráficos.
  - Caché y respaldo de la última tasa válida si un proveedor falla.
- **CRUD de administración** (usuarios, billeteras, saldos, transacciones y monedas): solo para los emails de `ADMIN_EMAILS`.
- **Seguridad:**
  - CORS con lista de orígenes;
  - protección CSRF (SameSite + verificación de origen);
  - cabeceras de seguridad (CSP, HSTS, X-Frame-Options…);
  - `no-store` en la API.
- **Logs:** una línea por petición con `request_id` (cabecera `X-Request-Id`), en JSON en producción.

### Clasificación de operaciones

| De → A | Tipo |
| --- | --- |
| COP / ARS → USD / EUR | **BUY** (compra) |
| USD / EUR → COP / ARS | **SELL** (venta) |
| COP ↔ ARS, USD ↔ EUR | **EXCHANGE** (intercambio) |

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
| GET | `/api/auth/session` | opcional | Sesión actual o `null` (siempre 200) |
| GET | `/api/auth/me` | ✔ | Usuario autenticado |
| GET | `/api/auth/email-available?email=` | — | ¿Email libre? (máx. 20/min por IP) |
| PATCH | `/api/users/me` | ✔ | Editar mi nombre y/o email (solo esos campos; 409 si el email ya existe) |
| PATCH | `/api/users/me/password` | ✔ | Cambiar mi contraseña: pide la actual (403 si es incorrecta) y la nueva sigue las reglas del registro |
| DELETE | `/api/users/me` | ✔ | Cerrar mi cuenta: pide la contraseña (403 si es incorrecta), exige saldos en 0 (409) y cierra la sesión |
| GET | `/api/rates?base=USD` | — | Tabla de tasas |
| GET | `/api/rates/convert?from&to&amount&ars_rate` | — | Conversión (cotizador) |
| GET | `/api/rates/ars` | — | Dólar oficial, MEP y blue |
| GET | `/api/rates/history?from&to&range` | — | Historial para gráficos (`1w`, `1m`, `3m`, `6m`, `1y`) |
| GET | `/api/wallets/me?valued_in=USD` | ✔ | Mi billetera y total estimado |
| POST | `/api/wallets/me/deposits` | ✔ | Recarga ficticia |
| GET | `/api/transactions/me/exchange/quote` | ✔ | Cotización exacta (tasa + comisión), no mueve saldos |
| POST | `/api/transactions/me/exchange` | ✔ | Compra, venta o intercambio |
| GET/PATCH/DELETE | `/api/users`, `/api/wallets`, `/api/balances`, `/api/transactions`, `/api/currencies` | ✔ admin | CRUD de administración |

Formato de las respuestas:
- éxito → `{ "data": ... }`
- error → `{ "error": "CODIGO", "message": "...", "details": [{ "path", "message" }] }`

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
├── integrations/          # Clientes de Frankfurter, DolarApi y ArgentinaDatos
├── middlewares/           # errores, logger de peticiones, límite por IP, cabeceras de seguridad
├── modules/               # Un módulo por dominio
│   ├── auth/              #   registro, login, sesión, cookies, requireAuth / requireAdmin
│   ├── wallets/           #   billetera /me y recargas
│   ├── transactions/      #   compra / venta / intercambio
│   ├── rates/             #   tasas, conversión e historial
│   └── users, balances, currencies/   # CRUD de administración
│       └── <x>.routes.ts · <x>.controller.ts · <x>.service.ts · <x>.repository.ts · <x>.middlewares.ts
└── utils/                 # AppError, logger, caché con respaldo, redondeo de montos
db/
├── schema.sql             # Esquema base
├── migrations/            # 001…005 (ver db/README.md)
└── README.md              # Reglas de la base y cómo aplicar migraciones
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

Si la base es nueva, aplica el esquema y las migraciones en orden:

```bash
npm run db:sql -- db/schema.sql db/migrations/001_google_auth.sql db/migrations/002_demo_deposits.sql db/migrations/003_add_ars.sql db/migrations/004_last_known_rates.sql db/migrations/005_exchange_fees.sql
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
| `npm test` | Tests unitarios y de integración (sin base de datos: los repositorios se simulan) |
| `TEST_DATABASE_URL=postgresql://…/nexpay_test npm test` | Además corre los tests contra una PostgreSQL real y descartable (con `db/schema.sql` y las migraciones aplicadas). El nombre de la base debe incluir `test` |
| `npm run db:sql -- <archivo.sql>` | Ejecuta SQL contra `DATABASE_URL` |

---

## Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✔ | — | Conexión a PostgreSQL |
| `JWT_SECRET` | ✔ | — | Secreto para firmar los JWT (mín. 32 caracteres) |
| `FRONTEND_URL` | ✔ | — | Orígenes permitidos por CORS, separados por coma (admite `*` para previews de Vercel) |
| `NODE_ENV` | | `development` | `production` activa cookies `Secure`, HSTS y logs en JSON |
| `PORT` | | `3000` | Puerto HTTP (Railway lo define solo) |
| `DB_SSL` | | según `NODE_ENV` | SSL hacia PostgreSQL |
| `JWT_EXPIRES_IN` | | `1h` | Duración de la sesión (`15m`, `1h`, `7d`…) |
| `RATES_CACHE_TTL_SECONDS` | | `3600` | Caché de Frankfurter |
| `ARS_RATES_CACHE_TTL_SECONDS` | | `300` | Caché de DolarApi |
| `HISTORY_CACHE_TTL_SECONDS` | | `21600` | Caché del historial |
| `DEMO_DEPOSITS_ENABLED` | | `true` | Permite recargas ficticias |
| `EXCHANGE_FEE_PERCENT` | | `0` | Comisión de compra/venta en % (0 en la Demo 1) |
| `ADMIN_EMAILS` | | vacío | Emails con acceso al CRUD de administración |

> Nunca subas el archivo `.env` al repositorio.

---

## Flujo de trabajo del equipo

- `main` está protegida: todo entra por Pull Request con 1 aprobación, sin force push.
- Una rama por cambio (`feat/…`, `fix/…`, `docs/…`), **squash merge** y borrar la rama al mergear.
- Los cambios de base de datos van **solo** como migración en `db/migrations/` (ver `db/README.md`).
- Mensajes de commit en español con el formato `tipo(área): descripción`.

## Equipo

| Integrante | Rol |
| --- | --- |
| William Coral | Líder técnico · back (auth, tasas, billetera, operaciones), revisión e integración |
| Nelson | Back · CRUD y compra de monedas |
| Raúl Alejandro Carmona (Alejo) | Conexión front ↔ back, sesión y tests |
| Tamara | Diseño visual del front (landing, tema negro y dorado) |
