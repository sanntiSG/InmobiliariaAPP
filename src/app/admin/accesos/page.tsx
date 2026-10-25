import { redirect } from "next/navigation";

/** Los accesos ahora viven en "Altas y permisos" (se conserva la dirección vieja). */
export default function AdminAccessRedirect() {
  redirect("/admin/altas?vista=accesos");
}
