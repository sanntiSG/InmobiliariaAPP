/**
 * La revisión programada de la disponibilidad: un alquiler cambia de estado SOLO cuando termina (o empieza) un período
 * ocupado, sin que nadie edite nada. Esta pasada compara el estado de hoy con el último que se calculó (`availability.current`)
 * y, cuando una propiedad vuelve a estar disponible, avisa. Es idempotente: si una pasada falla o se repite, la siguiente retoma
 * desde lo que quedó sin actualizar, y los avisos no se duplican (`dedupeKey` por propiedad y día).
 */
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { RENTAL_OPERATIONS } from "@/config/pricing";
import { rentalStatus, todayAr } from "@/lib/availability";
import { notifyPropertyAvailable } from "@/lib/notifications/availability";

export type SweepResult = { checked: number; changed: number; freed: number };

/** Sólo se revisan los alquileres publicados que pueden cambiar: con períodos, marcados no disponibles o con un estado viejo sin avisar. */
export async function sweepAvailability(deadline: number, now: Date = new Date()): Promise<SweepResult> {
  await connectDB();
  const today = todayAr(now);
  const docs = await Property.find({
    status: "published",
    operation: { $in: RENTAL_OPERATIONS },
    $or: [{ "availability.blocked.0": { $exists: true } }, { "availability.state": "unavailable" }, { "availability.current": "unavailable" }],
  })
    .select("slug title operation type price features.rooms address.neighborhood availability")
    .limit(500)
    .lean();

  let changed = 0;
  let freed = 0;
  for (const doc of docs) {
    if (Date.now() > deadline) break;
    const state = rentalStatus({ state: doc.availability?.state, blocked: (doc.availability?.blocked ?? []).map((b) => ({ from: b.from, to: b.to })) }, today).state;
    if (state === (doc.availability?.current ?? "available")) continue;
    // Se guarda primero el estado nuevo: si el aviso falla, no se vuelve a intentar por esta misma propiedad en cada pasada.
    const moved = await Property.updateOne({ _id: doc._id, "availability.current": doc.availability?.current ?? "available" }, { $set: { "availability.current": state } });
    if (moved.modifiedCount === 0) continue; // otra pasada o una edición se adelantó
    changed++;
    if (state === "available") {
      freed++;
      await notifyPropertyAvailable({ ...doc, price: doc.price ?? null });
    }
  }
  return { checked: docs.length, changed, freed };
}
