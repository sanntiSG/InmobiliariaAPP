import { z } from "zod";
import { LEAD_STATUSES } from "@/lib/leads/status";

/** Consulta pública desde la ficha de una propiedad. Hace falta al menos un medio de contacto. */
export const inquirySchema = z
  .object({
    name: z.string().trim().min(2, "Ingresá tu nombre").max(80),
    email: z.email("Email inválido").max(120).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9+()\-\s]*$/, "Sólo números, espacios, + y guiones")
      .optional()
      .or(z.literal("")),
    message: z.string().trim().min(3, "Escribí tu consulta").max(1000, "Máximo 1000 caracteres"),
    /** Honeypot: un humano nunca lo completa (campo oculto). La ruta lo detecta y descarta en silencio. */
    website: z.string().max(200).optional(),
  })
  .refine((v) => !!v.email || (v.phone ?? "").replace(/\D/g, "").length >= 6, {
    message: "Dejanos un email o un teléfono para poder responderte",
    path: ["email"],
  });

export type InquiryInput = z.infer<typeof inquirySchema>;

/** Cambios que la inmobiliaria puede hacer sobre un lead propio. */
export const leadUpdateSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
    /** Registrar un contacto (llamada, mensaje) sin cambiar de etapa. */
    contacted: z.boolean().optional(),
    visitRequested: z.boolean().optional(),
    visitDone: z.boolean().optional(),
    offerMade: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Sin cambios" });
