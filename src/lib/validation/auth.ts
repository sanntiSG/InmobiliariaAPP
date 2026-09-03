import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre").max(80),
  email: z.email("Ingresá un email válido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
