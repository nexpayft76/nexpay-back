import swaggerJSDoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "NexPay API",
    version: "1.0.0",
    description: "API para gestión de usuarios, wallets, balances, monedas y transacciones.",
  },
  // Sin "servers": Swagger usa el mismo host desde el que se abre /docs (local o Railway).
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  // Por defecto todas las rutas piden token (candado en /docs). Registro y login lo anulan con `security: []`.
  security: [{ bearerAuth: [] }],
};

export const swaggerSpec = swaggerJSDoc({
  definition: swaggerDefinition,
  apis: ["src/**/*.ts"],
});
