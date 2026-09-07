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
const tourEntrySchema = z.object({
  /** Opcional — ej. "Living", "Fachada". Si falta, la UI usa "Recorrido N". */
  label: z.string().trim().max(60).optional(),
  photo360Url: z.string().refine(isValidUrl, "Falta la foto 360°"),
});

const MAX_TOURS = 6;
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
    })
    .default({
      images: [],
      videos: [],
      floorPlans: [],
      tours: [],
    })
    // `hasTour3d` desnormalizado a partir de `tours.length` — así los
    // filtros/queries (`property-query.ts`, `agency-stats.ts`) no necesitan
    // inspeccionar el array. Se recalcula acá mismo en cada guardado, nunca
    // lo manda el cliente.
    .transform((v) => ({ ...v, hasTour3d: v.tours.length > 0 })),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
