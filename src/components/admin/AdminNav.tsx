"use client";

import { PanelNav, type NavGroup } from "@/components/panel/PanelNav";

/**
 * Menú del panel de administración: cómo viene la plataforma, quiénes son las inmobiliarias, quién entra y con qué permisos,
 * lo que se publica y los agentes.
 */
export function AdminNav({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const groups: NavGroup[] = [
    { items: [{ href: "/admin", label: "Resumen", exact: true }] },
    {
      title: "Plataforma",
      items: [
        { href: "/admin/inmobiliarias", label: "Inmobiliarias" },
        { href: "/admin/altas", label: "Altas y permisos", badge: pendingRequests, alsoActive: ["/admin/solicitudes", "/admin/accesos"] },
        { href: "/dashboard/propiedades", label: "Propiedades" },
      ],
    },
    { title: "Inteligencia", items: [{ href: "/admin/agentes", label: "Agentes", alsoActive: ["/admin/asesor"] }] },
    { title: "Cuenta", items: [{ href: "/admin/notificaciones", label: "Avisos" }] },
  ];
  return <PanelNav groups={groups} ariaLabel="Panel de administración" />;
}
