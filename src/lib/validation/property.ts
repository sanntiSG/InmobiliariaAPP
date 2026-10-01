import { z } from "zod";
import {
  OPERATIONS,
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  AMENITIES,
  CURRENCIES,
} from "@/config/filters";

const lngLatSchema = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .describe("[lng, lat]");

function isValidUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Un recorrido 360° — foto equirectangular ya subida a Cloudinary (mismo
 * endpoint que las fotos de la propiedad, `/api/dashboard/upload`), así que
 * acá sólo se valida que la URL exista y sea `https`. Una propiedad puede
 * tener varios (`tours: []`) — distintos ambientes, por ejemplo.
 */
const sceneIdSchema = z.string().regex(/^[a-zA-Z0-9-]{8,40}$/, "Id de escena inválido");

/** Ángulos en radianes: yaw normalizado a [0, 2π), pitch acotado a [-π/2, π/2]. */
const yawSchema = z
  .number()
  .finite()
  .transform((n) => ((n % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
const pitchSchema = z
  .number()
  .finite()
  .transform((n) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, n)));

const tourLinkSchema = z.object({
  id: sceneIdSchema,
  targetId: sceneIdSchema,
  label: z.string().trim().max(40).default(""),
  yaw: yawSchema,
  pitch: pitchSchema,
  arrivalYaw: yawSchema.default(0),
  arrivalPitch: pitchSchema.default(0),
});

const tourEntrySchema = z.object({
  id: sceneIdSchema,
  /** Opcional — ej. "Living", "Fachada". Si falta, la UI usa "Recorrido N". */
  label: z.string().trim().max(60).optional(),
  photo360Url: z.string().refine(isValidUrl, "Falta la foto 360°"),
  links: z.array(tourLinkSchema).max(12, "Máximo 12 marcadores por foto.").default([]),
  graph: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
});

const virtualTourSchema = z
  .object({
    enabled: z.boolean().default(false),
    startId: sceneIdSchema.optional(),
  })
  .default({ enabled: false });

const MAX_TOURS = 20;
const toursSchema = z.array(tourEntrySchema).max(MAX_TOURS, `Máximo ${MAX_TOURS} recorridos por propiedad.`).default([]);

const imageSchema = z.object({
  url: z.url(),
  alt: z.string().max(200).default(""),
  order: z.number().int().default(0),
  providerId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Esquema completo para crear/editar una propiedad desde el dashboard de
 * la inmobiliaria (consumido por formularios y por el route handler).
 */
export const propertyInputSchema = z.object({
  agencyId: z.string().length(24),
  title: z.string().min(5).max(160),
  description: z.string().max(5000).default(""),

  operation: z.enum(OPERATIONS),
  type: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES).default("draft"),

  price: z.object({
    amount: z.number().positive(),
    currency: z.enum(CURRENCIES).default("USD"),
    expenses: z.number().nonnegative().default(0),
    period: z.enum(["total", "mensual"]).default("total"),
  }),

  address: z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().min(2),
    province: z.string().optional(),
    country: z.string().default("Argentina"),
    showExact: z.boolean().default(true),
  }),
  location: lngLatSchema,

  features: z.object({
    rooms: z.number().int().nonnegative().optional(),
    bedrooms: z.number().int().nonnegative().optional(),
    bathrooms: z.number().int().nonnegative().optional(),
    garages: z.number().int().nonnegative().default(0),
    coveredArea: z.number().positive().optional(),
    totalArea: z.number().positive().optional(),
    age: z.number().int().nonnegative().optional(),
    floor: z.number().int().optional(),
    orientation: z.string().optional(),
  }),
  amenities: z.array(z.enum(AMENITIES)).default([]),

  media: z
    .object({
      images: z.array(imageSchema).default([]),
      videos: z
        .array(
          z.object({
            url: z.url(),
            thumbnail: z.url().optional(),
            provider: z.enum(["upload", "youtube", "vimeo"]).default("upload"),
          })
        )
        .default([]),
      floorPlans: z.array(imageSchema).default([]),
      tours: toursSchema,
      virtualTour: virtualTourSchema,
    })
    .default({
      images: [],
      videos: [],
      floorPlans: [],
      tours: [],
      virtualTour: { enabled: false },
    })
    .superRefine((v, ctx) => {
      const ids = new Set(v.tours.map((t) => t.id));
      if (ids.size !== v.tours.length) {
        ctx.addIssue({ code: "custom", message: "Ids de escena duplicados.", path: ["tours"] });
      }
      v.tours.forEach((t, i) =>
        t.links.forEach((l, j) => {
          if (!ids.has(l.targetId) || l.targetId === t.id) {
            ctx.addIssue({
              code: "custom",
              message: "Un marcador apunta a una foto inexistente.",
              path: ["tours", i, "links", j, "targetId"],
            });
          }
        })
      );
      if (v.virtualTour.startId && !ids.has(v.virtualTour.startId)) {
        ctx.addIssue({ code: "custom", message: "La foto de inicio no existe.", path: ["virtualTour", "startId"] });
      }
    })
    // `hasTour3d` desnormalizado a partir de `tours.length` — así los
    // filtros/queries (`property-query.ts`, `agency-stats.ts`) no necesitan
    // inspeccionar el array. Se recalcula acá mismo en cada guardado, nunca
    // lo manda el cliente. El recorrido navegable sólo queda activo si hay
    // al menos un vínculo.
    .transform((v) => ({
      ...v,
      hasTour3d: v.tours.length > 0,
      virtualTour: {
        ...v.virtualTour,
        enabled: v.virtualTour.enabled && v.tours.some((t) => t.links.length > 0),
      },
    })),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
