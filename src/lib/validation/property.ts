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
 * Cada recorrido 3D se carga por link (Polycam/Matterport/Kuula/Sketchfab,
 * o la URL de un .glb/.gltf/.usdz ya hosteado — ver
 * `src/lib/media/tour-embed.ts`) o subiendo una foto 360° (equirectangular,
 * `kind:"photo360"`) — esta última es una imagen común, sube por el mismo
 * camino que las fotos de la propiedad (`/api/dashboard/upload`), así que
 * acá sólo se valida que la URL exista y tenga forma de URL — no pasa por
 * `normalizeTourUrl` (eso es sólo para links de terceros con variantes
 * share/embed, no para algo que subimos nosotros a Cloudinary).
 * `normalizeTourUrl` es la misma función que usa el formulario para mostrar
 * el chip de detección antes de guardar; acá se vuelve a aplicar como
 * defensa en profundidad para un cliente que pegue directo contra la API
 * sin pasar por el form. Una propiedad puede tener varios (`tours: []`) —
 * distintos ambientes, o un link de Polycam + un `.glb` de respaldo.
 */
const tourEntryInputSchema = z.object({
  /** Opcional — ej. "Living", "Fachada". Si falta, la UI usa "Recorrido N". */
  label: z.string().trim().max(60).optional(),
  kind: z.enum(["iframe", "mesh", "photo360"]).default("iframe"),
  provider: z.enum(["matterport", "polycam", "kuula", "sketchfab", "custom"]).optional(),
  modelId: z.string().optional(),
  embedUrl: z.string().optional(),
  meshUrl: z.string().optional(),
  meshFormat: z.enum(["glb", "gltf", "usdz"]).optional(),
  photo360Url: z.string().optional(),
  thumbnail: z.url().optional(),
});

/**
 * Anotada explícitamente (en vez de dejar que TS infiera el retorno de
 * `.transform()`) para que el resultado sea UNA sola forma con campos
 * opcionales, no una unión de formas distintas por cada `return` — así
 * `.default()` más abajo (acá y en el `media` que lo contiene) puede
 * matchear contra un tipo simple en vez de una unión.
 */
type TourEntryOutput = {
  label?: string;
  kind: "iframe" | "mesh" | "photo360";
  provider?: TourProvider;
  modelId?: string;
  embedUrl?: string;
  meshUrl?: string;
  meshFormat?: "glb" | "gltf" | "usdz";
  photo360Url?: string;
  thumbnail?: string;
};

const tourEntrySchema = tourEntryInputSchema.transform((v, ctx): TourEntryOutput => {
  if (v.kind === "photo360") {
    if (!v.photo360Url || !isValidUrl(v.photo360Url)) {
      ctx.addIssue({ code: "custom", message: "Falta la foto 360°", path: ["photo360Url"] });
      return z.NEVER;
    }
    return { label: v.label, kind: "photo360", photo360Url: v.photo360Url, thumbnail: v.thumbnail };
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
      label: v.label,
      kind: "mesh",
      provider: detected.provider,
      modelId: v.modelId,
      meshUrl: detected.url,
      meshFormat: detected.format,
      thumbnail: v.thumbnail,
    };
  }

  return {
    label: v.label,
    kind: "iframe",
    provider: detected.provider,
    modelId: v.modelId,
    embedUrl: detected.url,
    thumbnail: v.thumbnail,
  };
});

function isValidUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

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
