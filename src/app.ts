import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { balancesRouter, currenciesRouter, transactionsRouter, usersRouter, walletsRouter } from "./modules";
import { healthRouter } from "./routes/health.routes";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ name: "NexPay API", status: "running" });
});

app.use("/health", healthRouter);
app.use("/api/users", usersRouter);
app.use("/api/wallets", walletsRouter);
app.use("/api/balances", balancesRouter);
app.use("/api/currencies", currenciesRouter);
app.use("/api/transactions", transactionsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
