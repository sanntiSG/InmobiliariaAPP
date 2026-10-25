import { redirect } from "next/navigation";

/** Las estadísticas de la plataforma son ahora el Resumen del admin (se conserva la dirección vieja). */
export default function AdminStatsRedirect() {
  redirect("/admin");
}
