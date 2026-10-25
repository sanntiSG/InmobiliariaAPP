/**
 * Auditoría de solo lectura: cuentas con un rol de gestión (admin o inmobiliaria) que tienen contraseña y nunca
 * verificaron su email. Es justo el tipo de cuenta que alguien pudo haber registrado de antemano con el email de otra
 * persona (el registro con contraseña no verifica nada): conviene revisarlas una por una.
 *
 *   npx tsx scripts/audit-unverified-accounts.ts
 *
 * No modifica nada y no imprime hashes: solo email, rol y proveedor.
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
  const risky = await User.find({
    role: { $in: ["admin", "agency_owner", "agency_agent"] },
    passwordHash: { $type: "string" },
    emailVerified: null,
  })
    .select("email role provider createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (risky.length === 0) {
    console.log("Ninguna cuenta de gestión tiene contraseña con email sin verificar.");
  } else {
    console.log(`${risky.length} cuenta(s) de gestión con contraseña y email sin verificar:`);
    for (const u of risky) {
      console.log(` - ${u.email} (${u.role}, ${u.provider}, creada ${u.createdAt?.toISOString().slice(0, 10)})`);
    }
    console.log(
      "\nSi alguna no la creaste vos desde el panel de admin, anulá su contraseña (passwordHash = null): entra con Google igual."
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Falló la auditoría:", err instanceof Error ? err.message : err);
  process.exit(1);
});
