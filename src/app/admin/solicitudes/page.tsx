import { redirect } from "next/navigation";

/** Las solicitudes ahora viven en "Altas y permisos" (se conserva la dirección vieja: hay notificaciones guardadas que apuntan acá). */
export default function AdminRequestsRedirect() {
  redirect("/admin/altas?vista=solicitudes");
}
