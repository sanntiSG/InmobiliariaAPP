import { redirect } from "next/navigation";

/** El estudio del asesor ahora vive en la sección Agentes (se conserva la dirección vieja). */
export default function AdvisorStudioRedirect() {
  redirect("/admin/agentes/advisor");
}
