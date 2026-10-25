/**
 * Bloquea las cuentas que todavía tienen la contraseña demo del seed.
 *
 * Esa contraseña estuvo escrita en SETUP.md y en `scripts/seed.ts` (repo público): cualquiera que la haya leído puede
 * entrar a una cuenta que la conserve, incluida la del admin de la plataforma. Este script busca los usuarios cuyo hash
 * coincide EXACTAMENTE con esa contraseña y les borra el hash (`passwordHash = null`): dejan de poder entrar por
 * contraseña, y nada más cambia (rol, inmobiliaria y propiedades quedan igual). Si alguien ya cambió su contraseña, no
 * coincide y no se toca. Es idempotente: se puede correr las veces que haga falta.
 *
 *   npx tsx scripts/lock-demo-accounts.ts            (muestra qué cuentas bloquearía, sin tocar nada)
 *   npx tsx scripts/lock-demo-accounts.ts --apply    (las bloquea)
 *
 * No imprime hashes ni contraseñas; solo emails y roles.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/lib/db/models/User";

// La contraseña ya es pública (estuvo en el repo); se compara solo para reconocer las cuentas afectadas.
const LEAKED_DEMO_PASSWORD = "Umbral2026!";

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = await User.find({ passwordHash: { $type: "string" } }).select("email role passwordHash").lean();

  const affected: { id: unknown; email: string; role: string }[] = [];
  for (const u of users) {
    if (u.passwordHash && (await bcrypt.compare(LEAKED_DEMO_PASSWORD, u.passwordHash))) {
      affected.push({ id: u._id, email: u.email, role: u.role });
    }
  }

  if (affected.length === 0) {
    console.log("Ninguna cuenta conserva la contraseña demo.");
  } else {
    console.log(`${affected.length} cuenta(s) con la contraseña demo pública:`);
    for (const a of affected) console.log(` - ${a.email} (${a.role})`);
    if (apply) {
      const res = await User.updateMany({ _id: { $in: affected.map((a) => a.id) } }, { $set: { passwordHash: null } });
      console.log(`Bloqueadas: ${res.modifiedCount}. Ya no pueden entrar por contraseña.`);
    } else {
      console.log("No se cambió nada. Corré con --apply para bloquearlas.");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Falló el script:", err instanceof Error ? err.message : err);
  process.exit(1);
});
