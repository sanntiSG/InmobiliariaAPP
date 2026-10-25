"use client";

import { PanelNav, type NavGroup } from "@/components/panel/PanelNav";

/**
 * Menú del panel de la inmobiliaria. Las secciones se agrupan por lo que se hace en ellas: ver cómo viene el día, gestionar
 * lo que se publica y se consulta, hacer crecer la visibilidad, y los datos de la cuenta.
 */
const GROUPS: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Hoy", exact: true }] },
  {
    title: "Gestión",
    items: [
      { href: "/dashboard/propiedades", label: "Propiedades" },
      { href: "/dashboard/clientes", label: "Clientes y consultas" },
    ],
  },
  {
    title: "Crecimiento",
    items: [
      { href: "/dashboard/rendimiento", label: "Rendimiento", alsoActive: ["/dashboard/oportunidades"] },
      { href: "/dashboard/contenido", label: "Contenido para redes" },
      { href: "/dashboard/agentes", label: "Agentes" },
    ],
  },
  { title: "Cuenta", items: [{ href: "/dashboard/inmobiliaria", label: "Mi inmobiliaria" }] },
];

const ADMIN_GROUP: NavGroup = { title: "Administración", items: [{ href: "/admin/inmobiliarias", label: "Volver al admin", alsoActive: ["/admin"] }] };

export function DashboardNav({ isAdmin = false }: { isAdmin?: boolean }) {
  return <PanelNav groups={isAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS} ariaLabel="Panel de la inmobiliaria" keepAgency={isAdmin} />;
}
