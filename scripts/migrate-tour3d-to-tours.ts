/**
 * Migración one-shot: `media.tour3d` (objeto único) → `media.tours` (array)
 * + `media.hasTour3d` (booleano desnormalizado).
 *
 * Antes, una propiedad tenía como mucho UN recorrido 3D, guardado en
 * `media.tour3d`. Ahora puede tener varios (`media.tours: []`) — distintos
 * ambientes escaneados por separado, o un link de Polycam + un `.glb` de
 * respaldo para cuando Polycam no se puede ver (ver
 * `src/lib/media/tour-embed.ts`, `PROVIDER_REQUIRES_WEBGPU`).
 *
 * Se opera directo contra la colección nativa (`Property.collection`, sin
 * pasar por el schema de Mongoose) porque `media.tour3d` ya no existe en el
 * schema actual — pasando por el modelo, `.lean()` seguiría trayendo el
 * campo viejo (Mongo no lo filtra), pero cualquier escritura vía el modelo
 * ignoraría por completo un campo que el schema ya no declara.
 *
 * Correr una sola vez con: npx tsx scripts/migrate-tour3d-to-tours.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { Property } from "../src/lib/db/models/Property";

type OldTour3D = {
  enabled?: boolean;
  kind?: string;
  provider?: string;
  modelId?: string;
  embedUrl?: string;
  meshUrl?: string;
  meshFormat?: string;
  thumbnail?: string;
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB.");

  const cursor = Property.collection.find<{ _id: mongoose.Types.ObjectId; media?: { tour3d?: OldTour3D } }>({
    "media.tour3d": { $exists: true },
  });

  let migrated = 0;
  let withTour = 0;

  for await (const doc of cursor) {
    const old = doc.media?.tour3d;
    const hasUrl = old?.enabled && (old.kind === "mesh" ? !!old.meshUrl : !!old.embedUrl);

    const tours = hasUrl
      ? [
          {
            kind: old!.kind ?? "iframe",
            provider: old!.provider,
            modelId: old!.modelId,
            embedUrl: old!.embedUrl,
            meshUrl: old!.meshUrl,
            meshFormat: old!.meshFormat,
            thumbnail: old!.thumbnail,
          },
        ]
      : [];

    await Property.collection.updateOne(
      { _id: doc._id },
      {
        $set: { "media.tours": tours, "media.hasTour3d": tours.length > 0 },
        $unset: { "media.tour3d": "" },
      }
    );

    migrated++;
    if (tours.length > 0) withTour++;
  }

  console.log(`Propiedades migradas: ${migrated} (${withTour} con recorrido, ${migrated - withTour} sin recorrido habilitado).`);

  await mongoose.disconnect();
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
