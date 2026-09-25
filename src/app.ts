import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { openApiDocument } from "./docs/openapi";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { authRouter } from "./routes/auth.routes";
import { healthRouter } from "./routes/health.routes";
import { ratesRouter } from "./routes/rates.routes";
import { walletRouter } from "./routes/wallet.routes";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ name: "NexPay API", status: "running", docs: "/docs" });
});
app.get("/docs.json", (_req, res) => {
  res.json(openApiDocument);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: "NexPay API · Docs",
  swaggerOptions: { persistAuthorization: true },
}));
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/wallet", walletRouter);
app.use("/rates", ratesRouter);

app.use(notFoundHandler);
app.use(errorHandler);
