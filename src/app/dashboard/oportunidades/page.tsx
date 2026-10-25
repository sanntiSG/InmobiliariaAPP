import { redirect } from "next/navigation";

/**
 * Las oportunidades ahora son la pestaña "Qué mejorar" de Rendimiento. Se conserva la dirección vieja (hay notificaciones y
 * enlaces guardados) y se mantiene la inmobiliaria que el admin estaba mirando.
 */
export default async function OpportunitiesRedirect({ searchParams }: { searchParams: Promise<{ agencyId?: string | string[] }> }) {
  const raw = (await searchParams).agencyId;
  const agencyId = Array.isArray(raw) ? raw[0] : raw;
  redirect(`/dashboard/rendimiento?vista=mejorar${agencyId && /^[a-f0-9]{24}$/i.test(agencyId) ? `&agencyId=${agencyId}` : ""}`);
}
