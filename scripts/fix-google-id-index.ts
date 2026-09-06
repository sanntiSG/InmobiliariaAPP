/**
 * Migración one-shot: arregla el índice único de `User.googleId`.
 *
 * Antes, el schema declaraba `googleId: { sparse: true, unique: true,
 * default: null }`. Un índice `sparse` de MongoDB sólo excluye documentos
 * donde el campo NO EXISTE, no donde vale `null` — y como el schema escribía
 * `default: null`, todo usuario creado por contraseña quedaba con
 * `googleId: null` físicamente guardado (e indexado). Resultado: el segundo
 * `User.create()` por contraseña (crear una segunda inmobiliaria desde
 * /admin, o un segundo registro normal) tiraba `E11000 duplicate key`.
 *
 * El fix definitivo es el nuevo índice con `partialFilterExpression` en
 * `src/lib/db/models/User.ts`. Este script prepara los datos existentes:
 * 1. Borra el índice viejo `googleId_1` si existe.
 * 2. Saca el campo `googleId` de los usuarios que lo tienen en `null`
 *    (así el nuevo índice parcial, que sólo mira strings, no los ve).
 *
 * Correr una sola vez con: npx tsx scripts/fix-google-id-index.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { User } from "../src/lib/db/models/User";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB.");

  try {
    await User.collection.dropIndex("googleId_1");
    console.log("Índice viejo googleId_1 eliminado.");
  } catch (err) {
    const code = (err as { codeName?: string })?.codeName;
    if (code === "IndexNotFound") {
      console.log("No había índice googleId_1 previo — nada que borrar.");
    } else {
      throw err;
    }
  }

  const result = await User.updateMany({ googleId: null }, { $unset: { googleId: "" } });
  console.log(`Usuarios corregidos (googleId: null → sin el campo): ${result.modifiedCount}`);

  // Al usar el modelo (arriba, con `User.updateMany`) Mongoose ya sincronizó
  // los índices declarados en el schema (autoIndex, prendido por defecto) —
  // esto crea el nuevo índice parcial. Se confirma explícitamente por las dudas.
  await User.syncIndexes();
  console.log("Índices sincronizados con el schema actual.");

  await mongoose.disconnect();
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
