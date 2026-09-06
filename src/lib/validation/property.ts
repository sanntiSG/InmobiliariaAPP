import { z } from "zod";
import {
  OPERATIONS,
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  AMENITIES,
  CURRENCIES,
} from "@/config/filters";
import { normalizeTourUrl, type TourProvider } from "@/lib/media/tour-embed";

const lngLatSchema = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .describe("[lng, lat]");

/**
 * El recorrido 3D se carga sólo por link (Polycam/Matterport/Kuula/Sketchfab,
 * o la URL de un .glb/.gltf/.usdz ya hosteado) — nunca por archivo subido
 * (ver `src/lib/media/tour-embed.ts` para el porqué). `normalizeTourUrl` es
 * la misma función que usa el formulario para mostrar el chip de detección
 * antes de guardar; acá se vuelve a aplicar como defensa en profundidad para
 * un cliente que pegue directo contra la API sin pasar por el form.
 */
const tour3dInputSchema = z
  .object({
    enabled: z.boolean().default(false),
    kind: z.enum(["iframe", "mesh"]).default("iframe"),
    provider: z.enum(["matterport", "polycam", "kuula", "sketchfab", "custom"]).optional(),
    modelId: z.string().optional(),
    embedUrl: z.string().optional(),
    meshUrl: z.string().optional(),
    meshFormat: z.enum(["glb", "gltf", "usdz"]).optional(),
    thumbnail: z.url().optional(),
  })
  // El default vive acá, en el schema "plano" previo al `.transform()` de
  // abajo — puesto en el `.transform()` en cambio, TS no logra inferir el
  // tipo de entrada porque su salida es una unión de formas distintas.
  .default({ enabled: false, kind: "iframe" });

/**
 * Anotada explícitamente (en vez de dejar que TS infiera el retorno de
 * `.transform()`) para que el resultado sea UNA sola forma con campos
 * opcionales, no una unión de formas distintas por cada `return` — así
 * `.default()` más abajo (acá y en el `media` que lo contiene) puede
 * matchear contra un tipo simple en vez de una unión.
 */
type Tour3DOutput = {
  enabled: boolean;
  kind: "iframe" | "mesh";
  provider?: TourProvider;
  modelId?: string;
  embedUrl?: string;
  meshUrl?: string;
  meshFormat?: "glb" | "gltf" | "usdz";
  thumbnail?: string;
};

const tour3dSchema = tour3dInputSchema.transform((v, ctx): Tour3DOutput => {
  if (!v.enabled) {
    return { enabled: false, kind: "iframe", thumbnail: v.thumbnail };
  }

  const raw = v.kind === "mesh" ? v.meshUrl : v.embedUrl;
  if (!raw) {
    ctx.addIssue({ code: "custom", message: "Falta la URL del recorrido", path: ["embedUrl"] });
    return z.NEVER;
  }

  const detected = normalizeTourUrl(raw);
  if (detected.kind === "invalid") {
    ctx.addIssue({ code: "custom", message: detected.reason, path: ["embedUrl"] });
    return z.NEVER;
  }

  if (detected.kind === "mesh") {
    return {
      enabled: true,
      kind: "mesh",
      provider: detected.provider,
      modelId: v.modelId,
      meshUrl: detected.url,
      meshFormat: detected.format,
      thumbnail: v.thumbnail,
    };
  }

  return {
    enabled: true,
    kind: "iframe",
    provider: detected.provider,
    modelId: v.modelId,
    embedUrl: detected.url,
    thumbnail: v.thumbnail,
  };
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
      tour3d: tour3dSchema,
    })
    .default({
      images: [],
      videos: [],
      floorPlans: [],
      tour3d: { enabled: false, kind: "iframe" },
    }),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
