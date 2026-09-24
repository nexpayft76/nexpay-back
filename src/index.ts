import { app } from "./app";
import { pool } from "./config/db";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(`NexPay API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  console.log(`${signal} recibido, cerrando servidor...`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
