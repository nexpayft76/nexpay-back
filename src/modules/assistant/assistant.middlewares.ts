import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";

export const MAX_MESSAGE_LENGTH = 500;
/** Turnos anteriores que se mandan a la IA (los últimos): suficiente contexto sin gastar de más. */
export const MAX_HISTORY = 10;

const chatSchema = z
  .object({
    message: z
      .string({ error: "El mensaje es obligatorio" })
      .trim()
      .min(1, "Escribe un mensaje")
      .max(MAX_MESSAGE_LENGTH, `El mensaje puede tener hasta ${MAX_MESSAGE_LENGTH} caracteres`),
    history: z
      .array(
        z
          .object({
            // Solo "user" y "assistant": el cliente nunca puede mandar un mensaje de "system".
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(50)
      .default([])
      .transform((turns) => turns.slice(-MAX_HISTORY)),
    // Modelo elegido en el chat (opcional): solo uno de los configurados en OPENROUTER_MODELS.
    model: z
      .string()
      .refine((model) => env.openRouterModels.includes(model), "Modelo no disponible")
      .optional(),
  })
  .strict();

export type ChatBody = z.output<typeof chatSchema>;

/** Valida el body de POST /api/assistant/chat. */
export function validateChat(req: Request, _res: Response, next: NextFunction): void {
  const result = chatSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_ASSISTANT_PAYLOAD",
      "Mensaje inválido",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  req.body = result.data;
  next();
}
