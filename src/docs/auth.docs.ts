import { z } from "zod";
import { loginSchema, registerSchema } from "../schemas/auth.schema";
import { bearerAuth, errorResponse, jsonResponse, registry } from "./registry";

const UserSchema = z
  .object({
    id: z.uuid().meta({ example: "3f1c2a9e-8b7d-4c21-9a55-0e6f7b8c9d10" }),
    fullName: z.string().meta({ example: "Ana Pérez" }),
    email: z.email().meta({ example: "ana@nexpay.com" }),
    status: z.enum(["active", "suspended", "closed"]),
    createdAt: z.iso.datetime().meta({ example: "2026-09-24T21:00:00.000Z" }),
  })
  .meta({ id: "User" });

const AuthResponseSchema = z
  .object({
    token: z.string().meta({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int().meta({ description: "Segundos hasta que expira el token", example: 3600 }),
    user: UserSchema,
  })
  .meta({ id: "AuthResponse" });

const MessageSchema = z.object({ message: z.string().meta({ example: "Sesión cerrada correctamente" }) });

const jsonBody = (schema: z.ZodType) => ({ content: { "application/json": { schema } }, required: true });

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Registrar un usuario",
  description:
    "Crea el usuario (contraseña con bcrypt), su wallet y un balance en 0 por cada moneda activa, " +
    "todo en una sola transacción SQL. Devuelve un JWT para iniciar sesión de inmediato.",
  request: { body: jsonBody(registerSchema) },
  responses: {
    201: jsonResponse("Usuario creado", AuthResponseSchema),
    400: errorResponse("Datos inválidos (VALIDATION_ERROR)"),
    409: errorResponse("El email ya está registrado (EMAIL_ALREADY_REGISTERED)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Iniciar sesión",
  request: { body: jsonBody(loginSchema) },
  responses: {
    200: jsonResponse("Login correcto", AuthResponseSchema),
    400: errorResponse("Datos inválidos (VALIDATION_ERROR)"),
    401: errorResponse("Email o contraseña incorrectos (INVALID_CREDENTIALS)"),
    403: errorResponse("Cuenta suspendida o cerrada (ACCOUNT_DISABLED)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Cerrar sesión",
  description: "Invalida el token actual: después de esto, usarlo devuelve 401.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse("Sesión cerrada", MessageSchema),
    401: errorResponse("Token ausente, inválido, expirado o ya revocado (UNAUTHORIZED)"),
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Obtener el usuario autenticado",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse("Datos del usuario", z.object({ user: UserSchema })),
    401: errorResponse("Token ausente, inválido, expirado o ya revocado (UNAUTHORIZED)"),
  },
});
