/**
 * Borra las solicitudes de inmobiliaria "aprobadas" que quedaron viejas: su
 * email ya no tiene un permiso vigente (`AllowedEmail`) y la cuenta es una
 * persona común (o ya no existe). Pasaba cuando se borraba una inmobiliaria o
 * se revocaba un permiso con la versión anterior del código: la solicitud
 * seguía diciendo "aprobada" y la persona no podía pedir permiso de nuevo.
 *
 * Es una herramienta ad-hoc (mismo patrón que `reconcile-property-stats`):
 *   npm run fix-stale-agency-requests            → sólo LISTA lo que borraría
 *   npm run fix-stale-agency-requests -- --apply → lo borra
 * Las cuentas NO se tocan: sólo se borra la solicitud vieja.
 */
import { config } from "dotenv";
import mongoose from "mongoose";

config({ path: ".env.local" });

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGODB_URI) throw new Error("Falta MONGODB_URI (.env.local).");
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db!;

  const approved = await db.collection("agencyrequests").find({ status: "approved" }).toArray();
  const stale: typeof approved = [];

  for (const request of approved) {
    const hasPermission = !!(await db.collection("allowedemails").findOne({ email: request.email }));
    if (hasPermission) continue;
    const user = await db.collection("users").findOne({ _id: request.userId });
    // Si todavía tiene rol de agencia, la solicitud está bien aunque falte la fila de permiso.
    if (user && (user.role === "agency_owner" || user.role === "agency_agent" || user.role === "admin")) continue;
    stale.push(request);
  }

  console.log(`${approved.length} solicitud(es) aprobada(s); ${stale.length} vieja(s) sin permiso vigente:`);
  for (const r of stale) console.log(`  - ${r.email} (${r.agencyName}) — aprobada ${r.reviewedAt ? new Date(r.reviewedAt).toISOString() : "?"}`);

  if (stale.length === 0) console.log("Nada que reparar.");
  else if (!apply) console.log("\nModo prueba: no se borró nada. Volvé a correr con --apply para borrarlas.");
  else {
    const res = await db.collection("agencyrequests").deleteMany({ _id: { $in: stale.map((r) => r._id) } });
    console.log(`\nBorradas: ${res.deletedCount}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
