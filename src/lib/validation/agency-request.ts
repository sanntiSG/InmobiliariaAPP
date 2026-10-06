import { z } from "zod";

export const agencyRequestSchema = z.object({
  agencyName: z.string().trim().min(2, "Ingresá el nombre de la inmobiliaria").max(120),
  phone: z
    .string()
    .trim()
    .min(6, "Ingresá un teléfono de contacto")
    .max(30)
    .regex(/^[0-9+()\-\s]+$/, "Sólo números, espacios, + y guiones"),
  zone: z.string().trim().min(2, "Contanos en qué zona trabajás").max(120),
  message: z.string().trim().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
  /** Honeypot: un humano nunca lo completa (campo oculto). La ruta lo detecta y descarta en silencio. */
  website: z.string().max(200).optional(),
});

export type AgencyRequestInput = z.infer<typeof agencyRequestSchema>;

export const reviewAgencyRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});
