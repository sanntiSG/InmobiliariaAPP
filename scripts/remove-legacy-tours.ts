/**
 * Migración one-shot: la app dejó de soportar recorridos vía link de
 * proveedor (Polycam/Matterport/Kuula/Sketchfab, `kind:"iframe"`) y vía
 * archivo `.glb`/`.usdz` (`kind:"mesh"`) — ahora `media.tours[]` sólo
 * admite foto 360° propia (`{ label?, photo360Url }`, sin `kind`).
 *
 * Este script recorre todas las propiedades y, dentro de `media.tours`, se
 * queda únicamente con las entradas que ya son foto 360° (tienen
 * `photo360Url`); las de `kind:"iframe"`/`"mesh"` se descartan porque ya no
 * hay forma de mostrarlas. Recalcula `media.hasTour3d` según lo que quede.
 *
 * Se opera directo contra la colección nativa (`Property.collection`) por
 * el mismo motivo que `migrate-tour3d-to-tours.ts`: el schema de Mongoose
 * actual ya no declara `kind`/`embedUrl`/`meshUrl`, así que escribir vía el
 * modelo no alcanzaría para "limpiar" los campos viejos que puedan quedar
 * en un documento existente.
 *
 * Correr una sola vez con: npx tsx scripts/remove-legacy-tours.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { Property } from "../src/lib/db/models/Property";

type AnyTour = {
  label?: string;
  photo360Url?: string;
  kind?: string;
  embedUrl?: string;
  meshUrl?: string;
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB.");

  const cursor = Property.collection.find<{
    _id: mongoose.Types.ObjectId;
    title?: string;
    media?: { tours?: AnyTour[] };
  }>({ "media.tours.0": { $exists: true } });

  let scanned = 0;
  let changed = 0;
  let droppedTours = 0;

  for await (const doc of cursor) {
    const before = doc.media?.tours ?? [];
    const kept = before
      .filter((t) => !!t.photo360Url)
      .map((t) => ({ label: t.label, photo360Url: t.photo360Url! }));

    scanned++;
    if (kept.length !== before.length) {
      droppedTours += before.length - kept.length;
      changed++;
      console.log(
        `  "${doc.title ?? doc._id}": ${before.length} → ${kept.length} recorrido(s) (se descartan ${before.length - kept.length} de link/mesh).`
      );
    }

    await Property.collection.updateOne(
      { _id: doc._id },
      { $set: { "media.tours": kept, "media.hasTour3d": kept.length > 0 } }
    );
  }

  console.log(
    `Listo: ${scanned} propiedades con recorridos revisadas, ${changed} modificadas, ${droppedTours} recorrido(s) legacy descartado(s).`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
