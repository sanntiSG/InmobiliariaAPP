import type { Types } from "mongoose";
import { Interaction, type INTERACTION_TYPES } from "@/lib/db/models/Interaction";
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";

export type EventType = (typeof INTERACTION_TYPES)[number];
type Id = string | Types.ObjectId;

/** Argentina no usa horario de verano: UTC-3 fijo. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
/** La permanencia sólo se guarda como Interaction (señal de interés) si supera este umbral. */
const DWELL_INTERACTION_MIN_MS = 60_000;
const DWELL_MAX_MS = 30 * 60_000;

/** Medianoche (hora Argentina) del instante dado, como Date en UTC. */
export function dayStart(date = new Date()): Date {
  const shifted = new Date(date.getTime() - AR_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + AR_OFFSET_MS);
}

export type RecordEventInput = {
  type: EventType;
  propertyId: Id;
  agencyId: Id;
  userId?: Id | null;
  anonId?: string | null;
  meta?: Record<string, unknown>;
  /** Sólo `view`: primera vista del visitante en el día → suma a `uniqueViews`. */
  unique?: boolean;
  /** Sólo `dwell`: milisegundos de permanencia. */
  valueMs?: number;
  /** Sólo `tour_scene`: id de la escena vista. */
  sceneId?: string;
};

/** Las claves de un documento Mongo no pueden tener "." ni empezar con "$". */
function safeKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}

function dailyIncrements(e: RecordEventInput): Record<string, number> {
  switch (e.type) {
    case "view":
      return { views: 1, ...(e.unique ? { uniqueViews: 1 } : {}) };
    case "like":
      return { likes: 1 };
    case "unlike":
      return { likes: -1 };
    case "save":
      return { saves: 1 };
    case "unsave":
      return { saves: -1 };
    case "comment":
      return { comments: 1 };
    case "share":
      return { shares: 1 };
    case "contact":
      return { contacts: 1 };
    case "inquiry":
      return { inquiries: 1 };
    case "tour_open":
      return { tourOpens: 1 };
    case "tour_scene":
      return e.sceneId ? { [`scenes.${safeKey(e.sceneId)}`]: 1 } : {};
    case "dwell": {
      const ms = Math.min(Math.max(0, Math.round(e.valueMs ?? 0)), DWELL_MAX_MS);
      return ms > 0 ? { dwellMsTotal: ms, dwellSamples: 1 } : {};
    }
    default:
      return {};
  }
}

/**
 * Punto único de escritura de eventos: agrega al log `Interaction` (fuente
 * para el perfil de gustos y las recomendaciones) e incrementa el rollup
 * diario `PropertyDailyStat` (fuente de dashboards y diagnósticos).
 *
 * Nunca lanza: un fallo de tracking no debe romper la acción del usuario
 * (like, comentario, etc.) que ya se aplicó.
 */
export async function recordEvent(e: RecordEventInput): Promise<void> {
  try {
    const writes: Promise<unknown>[] = [];

    const skipInteraction =
      e.type === "tour_scene" || (e.type === "dwell" && (e.valueMs ?? 0) < DWELL_INTERACTION_MIN_MS);
    if (!skipInteraction) {
      writes.push(
        Interaction.create({
          type: e.type,
          propertyId: e.propertyId,
          agencyId: e.agencyId,
          userId: e.userId ?? null,
          anonId: e.anonId ?? null,
          meta: e.type === "dwell" ? { ms: Math.min(e.valueMs ?? 0, DWELL_MAX_MS) } : (e.meta ?? {}),
        })
      );
    }

    const inc = dailyIncrements(e);
    if (Object.keys(inc).length > 0) {
      writes.push(
        PropertyDailyStat.updateOne(
          { propertyId: e.propertyId, day: dayStart() },
          { $inc: inc, $setOnInsert: { agencyId: e.agencyId } },
          { upsert: true }
        ).catch(async (err) => {
          // Carrera de upsert simultáneo sobre el índice único (propertyId, day).
          if ((err as { code?: number }).code === 11000) {
            await PropertyDailyStat.updateOne({ propertyId: e.propertyId, day: dayStart() }, { $inc: inc });
            return;
          }
          throw err;
        })
      );
    }

    await Promise.all(writes);
  } catch (err) {
    console.error(`recordEvent(${e.type}) failed:`, err);
  }
}
