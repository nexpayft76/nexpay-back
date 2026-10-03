import { Router } from "express";
import { rateLimit } from "../../middlewares/rate-limit.middleware";
import { chat, guestChat, models } from "./assistant.controller";
import { validateChat } from "./assistant.middlewares";

/** Con sesión: chat con los datos del usuario. app.ts lo monta detrás de requireAuth. */
export const assistantRouter = Router();

/** Sin sesión: chat de la landing (solo información pública) y estado de los modelos. */
export const assistantPublicRouter = Router();

/**
 * @openapi
 * /api/assistant/public/chat:
 *   post:
 *     summary: Conversar con Nexa sin iniciar sesión (landing)
 *     description: |
 *       Responde dudas básicas: qué es NexPay, las tasas del día, cálculos rápidos, cómo crear una cuenta,
 *       iniciar sesión o recuperar la contraseña. No ve datos de ningún usuario: si preguntan por su cuenta,
 *       invita a iniciar sesión. Máximo 8 mensajes por minuto por IP y 60 por minuto en total.
 *     tags: [Assistant]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 500, example: "¿Cómo creo una cuenta?" }
 *               model: { type: string, description: "Modelo elegido (opcional)" }
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [user, assistant] }
 *                     content: { type: string }
 *     responses:
 *       200:
 *         description: Respuesta de Nexa (mismo formato que /api/assistant/chat)
 *       400:
 *         description: Mensaje inválido (INVALID_ASSISTANT_PAYLOAD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados mensajes (TOO_MANY_REQUESTS) o modelos sin cupo (ASSISTANT_BUSY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
assistantPublicRouter.post(
  "/public/chat",
  // Cualquiera puede usarlo: límite por persona y uno general, para que nadie agote el cupo gratis de la IA.
  rateLimit({ windowMs: 60_000, max: 8, key: (req) => `asistente-publico:${req.ip}` }),
  rateLimit({ windowMs: 60_000, max: 60, key: () => "asistente-publico:total" }),
  validateChat,
  guestChat,
);

/**
 * @openapi
 * /api/assistant/chat:
 *   post:
 *     summary: Conversar con el asistente de NexPay (IA)
 *     description: |
 *       Responde dudas sobre NexPay, sus funciones, las monedas y sus tasas actuales, y hace cálculos rápidos.
 *       Conoce los saldos y últimos movimientos del usuario (solo lectura).
 *       **Nunca ejecuta operaciones**: no tiene herramientas para mover dinero; explica cómo hacerlo al usuario.
 *       Si le preguntan algo que no es de NexPay, responde que solo puede ayudar con NexPay.
 *       Máximo 15 mensajes por minuto por usuario.
 *     tags: [Assistant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 500, example: "¿Cuántos dólares son 100.000 pesos colombianos?" }
 *               model:
 *                 type: string
 *                 description: Modelo elegido (uno de GET /api/assistant/models). Si está sin cupo, responde otro.
 *                 example: "nvidia/nemotron-3-super-120b-a12b:free"
 *               history:
 *                 type: array
 *                 description: Turnos anteriores de la conversación (se usan los últimos 10)
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [user, assistant] }
 *                     content: { type: string }
 *     responses:
 *       200:
 *         description: Respuesta del asistente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     reply: { type: string, example: "100.000 COP ≈ **30,20 USD** (1 COP = 0,000302 USD)." }
 *                     model: { type: string, example: "nvidia/nemotron-3-super-120b-a12b:free" }
 *                     model_label: { type: string, example: "Nemotron 3 Super 120B" }
 *       400:
 *         description: Mensaje inválido (INVALID_ASSISTANT_PAYLOAD)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       401:
 *         description: Sin sesión (UNAUTHORIZED)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       429:
 *         description: Demasiados mensajes (TOO_MANY_REQUESTS) o la IA está saturada (ASSISTANT_BUSY)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       502:
 *         description: La IA no pudo responder (ASSISTANT_ERROR)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 *       503:
 *         description: Asistente sin configurar (ASSISTANT_UNAVAILABLE)
 *         content: { application/json: { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
 */
/**
 * @openapi
 * /api/assistant/models:
 *   get:
 *     summary: Modelos de IA del asistente y su estado
 *     description: |
 *       Del más capaz al más básico. `available: false` significa que se quedó sin cupo o falló hace poco;
 *       `resets_at` dice cuándo se vuelve a probar (la hora que informa OpenRouter o una pausa de 5 minutos).
 *       OpenRouter no informa cuántos mensajes le quedan a cada modelo gratis. Es pública (no tiene datos de nadie).
 *     tags: [Assistant]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de modelos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: "qwen/qwen3.8-27b:free" }
 *                       label: { type: string, example: "Qwen 3.8 27B" }
 *                       rank: { type: integer, example: 3 }
 *                       tier: { type: string, enum: [Avanzado, Intermedio, Básico] }
 *                       available: { type: boolean }
 *                       resets_at: { type: string, format: date-time, nullable: true }
 */
assistantPublicRouter.get("/models", models);

assistantRouter.post(
  "/chat",
  // Por usuario (no por IP): cuida la key de la IA sin afectar a otros usuarios de la misma red.
  rateLimit({ windowMs: 60_000, max: 15, key: (req) => `asistente:${req.auth?.userId ?? req.ip}` }),
  validateChat,
  chat,
);
