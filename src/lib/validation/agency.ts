import { z } from "zod";

export const AGENCY_STATUSES = ["active", "suspended", "pending"] as const;
export const AGENCY_STATUS_LABELS: Record<(typeof AGENCY_STATUSES)[number], string> = {
  active: "Activa",
  suspended: "Suspendida",
  pending: "Pendiente",
};

export const agencyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  whatsapp: z.string().trim().min(6).max(20),
  phone: z.string().trim().max(20).optional(),
  email: z.email().optional().or(z.literal("")),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80).optional(),
  status: z.enum(AGENCY_STATUSES).default("active"),
});

export const agencyWithOwnerSchema = agencyInputSchema.extend({
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.email("Email inválido"),
  ownerPassword: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export type AgencyInput = z.infer<typeof agencyInputSchema>;
export type AgencyWithOwnerInput = z.infer<typeof agencyWithOwnerSchema>;
