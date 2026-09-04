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

const tour3dSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** "iframe": link de un proveedor (Matterport/Polycam/Kuula). "mesh": archivo glb/gltf/usdz propio. */
    kind: z.enum(["iframe", "mesh"]).default("iframe"),
    provider: z.enum(["matterport", "polycam", "kuula", "custom"]).default("polycam"),
    modelId: z.string().optional(),
    embedUrl: z.url("Ingresá una URL válida").optional(),
    meshUrl: z.url().optional(),
    meshFormat: z.enum(["glb", "gltf", "usdz"]).optional(),
    thumbnail: z.url().optional(),
  })
  .refine((v) => !v.enabled || v.kind !== "iframe" || !!v.embedUrl, {
    message: "Falta la URL del recorrido",
    path: ["embedUrl"],
  })
  .refine((v) => !v.enabled || v.kind !== "mesh" || !!v.meshUrl, {
    message: "Falta subir el archivo 3D",
    path: ["meshUrl"],
  });

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
      tour3d: tour3dSchema.default({ enabled: false, kind: "iframe", provider: "polycam" }),
    })
    .default({
      images: [],
      videos: [],
      floorPlans: [],
      tour3d: { enabled: false, kind: "iframe", provider: "polycam" },
    }),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
