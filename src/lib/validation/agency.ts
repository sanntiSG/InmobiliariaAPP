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

/**
 * Alta desde /admin/inmobiliarias/nueva. El acceso a un email es opcional:
 * el admin puede crear la inmobiliaria sola (para pruebas, o para él mismo)
 * y dar el permiso más tarde desde "Editar" → "Accesos de esta inmobiliaria"
 * (ver `AllowedEmailsManager`). Si tilda `grantAccess`, sólo el email es
 * obligatorio — nombre/contraseña quedan para crear además una cuenta por
 * contraseña; si se deja la contraseña vacía, la persona entra con Google.
 */
export const agencyCreateSchema = agencyInputSchema
  .extend({
    grantAccess: z.boolean().default(false),
    ownerName: z.string().trim().max(80).optional().or(z.literal("")),
    ownerEmail: z.email("Email inválido").optional().or(z.literal("")),
    ownerPassword: z.string().min(8, "Mínimo 8 caracteres").max(72).optional().or(z.literal("")),
  })
  .refine((v) => !v.grantAccess || !!v.ownerEmail, {
    message: "Ingresá el email al que le das acceso",
    path: ["ownerEmail"],
  })
  .refine((v) => !v.ownerPassword || !!v.ownerName, {
    message: "Poné un nombre para la cuenta con contraseña",
    path: ["ownerName"],
  });

/**
 * Alta de inmobiliaria por el propio usuario ya autorizado (ver
 * POST /api/agency/onboarding) — sin `status` (siempre nace "active") y sin
 * datos de owner (el usuario logueado ya es el dueño).
 */
export const onboardingAgencySchema = agencyInputSchema.omit({ status: true });

/**
 * Imagen propia de la plataforma: sólo se aceptan URLs que devolvió nuestro
 * storage (Cloudinary o el provider local de desarrollo) — nunca una URL
 * arbitraria, que permitiría hotlinkear contenido de terceros o rastrear
 * a quien visita el perfil.
 */
const ownedImageUrl = z
  .string()
  .max(500)
  .refine((u) => u === "" || u.startsWith("https://res.cloudinary.com/") || u.startsWith("/uploads/"), {
    message: "La imagen debe subirse desde la plataforma.",
  });

/** Edición del perfil por la propia inmobiliaria (o el admin) — nunca toca estado, dueños ni slug. */
export const agencyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  whatsapp: z.string().trim().min(6).max(20),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.email("Email inválido").optional().or(z.literal("")),
  website: z
    .url({ protocol: /^https?$/, message: "Ingresá una dirección web válida (https://…)" })
    .max(200)
    .optional()
    .or(z.literal("")),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80).optional().or(z.literal("")),
  logo: ownedImageUrl.optional(),
  cover: ownedImageUrl.optional(),
  /** Sólo lo usa el admin, para elegir qué inmobiliaria edita. */
  agencyId: z.string().length(24).optional(),
});

export type AgencyProfileInput = z.infer<typeof agencyProfileSchema>;
export type AgencyInput = z.infer<typeof agencyInputSchema>;
export type AgencyCreateInput = z.infer<typeof agencyCreateSchema>;
export type OnboardingAgencyInput = z.infer<typeof onboardingAgencySchema>;
