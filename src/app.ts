import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { corsOptions } from "./config/cors";
import { swaggerSpec } from "./config/swagger";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/request-logger.middleware";
import { securityHeaders } from "./middlewares/security-headers.middleware";
import { alertsRouter, balancesRouter, currenciesRouter, transactionsRouter, usersRouter, walletsRouter } from "./modules";
import { requireAuth } from "./modules/auth/auth.middlewares";
import { authRouter } from "./modules/auth/auth.routes";
import { ratesRouter } from "./modules/rates/rates.routes";
import { healthRouter } from "./routes/health.routes";

export const app = express();

app.disable("x-powered-by");
app.set("etag", false); // Sin respuestas 304: la API no se cachea (ver "no-store" abajo).
// Delante del back hay dos proxies: Vercel (reenvía /api desde el front) y el de Railway.
// Así req.ip es la IP real del cliente (la usa el límite de consultas).
app.set("trust proxy", 2);
app.use(requestLogger);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));
// Datos de sesión y de dinero: nunca en caché (ni en el navegador ni en el proxy de Vercel).
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/", (_req, res) => {
  res.json({ name: "NexPay API", status: "running" });
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
// Tasas públicas: la landing y el cotizador las muestran sin iniciar sesión.
app.use("/api/rates", ratesRouter);

// Todo lo que está debajo exige sesión: requireAuth se aplica al módulo entero,
// así ninguna ruta nueva queda pública por olvido.
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/wallets", requireAuth, walletsRouter);
app.use("/api/balances", requireAuth, balancesRouter);
app.use("/api/currencies", requireAuth, currenciesRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/alerts", requireAuth, alertsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
