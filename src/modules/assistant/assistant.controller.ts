import type { Request, Response } from "express";
import { getAuth } from "../auth/auth.middlewares";
import type { ChatBody } from "./assistant.middlewares";
import { assistantService } from "./assistant.service";

/** El usuario sale del token: el asistente solo ve los datos de quien está conversando. */
export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history, model } = req.body as ChatBody;
  const result = await assistantService.chat(getAuth(req).userId, message, history, model);
  res.status(200).json({ data: result });
}

/** Modelos del asistente, del más capaz al más básico, con su estado (disponible o sin cupo). */
export function models(_req: Request, res: Response): void {
  res.status(200).json({ data: assistantService.models() });
}
