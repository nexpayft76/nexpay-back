import { z } from "zod";

// `.meta()` es nativo de zod: más adelante Swagger reutiliza estos mismos schemas para documentar la API.

const emailField = z
  .string({ error: "El email es obligatorio" })
  .trim()
  .toLowerCase()
  .max(255, "El email no puede superar 255 caracteres")
  .pipe(z.email({ error: "El email no tiene un formato válido" }))
  .meta({ format: "email", example: "ana@nexpay.com" });

export const registerSchema = z
  .object({
    fullName: z
      .string({ error: "El nombre es obligatorio" })
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(120, "El nombre no puede superar 120 caracteres")
      .meta({ example: "Ana Pérez" }),
    email: emailField,
    password: z
      .string({ error: "La contraseña es obligatoria" })
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      // bcrypt solo usa los primeros 72 bytes; más allá se ignorarían en silencio.
      .max(72, "La contraseña no puede superar 72 caracteres")
      .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "La contraseña debe contener al menos una letra y un número")
      .meta({ description: "8 a 72 caracteres, con al menos una letra y un número", example: "Secreta123" }),
  })
  .meta({ id: "RegisterInput" });

export const loginSchema = z
  .object({
    email: emailField,
    password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria").meta({ example: "Secreta123" }),
  })
  .meta({ id: "LoginInput" });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
