"use client";

import { useState } from "react";
import { PropertyGrid } from "@/components/property/PropertyGrid";
import type { PropertyCardData } from "@/components/property/types";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/config/filters";
import { cn } from "@/lib/utils/cn";

const PLURALS: Record<PropertyType, string> = {
  casa: "Casas",
  departamento: "Departamentos",
  ph: "PH",
  terreno: "Terrenos",
  local: "Locales",
  oficina: "Oficinas",
  galpon: "Galpones",
  quinta: "Quintas",
};

/** Propiedades de la inmobiliaria separadas por tipo (casas, departamentos, terrenos…), con "Todas" por defecto. */
export function AgencyPropertiesTabs({ properties }: { properties: PropertyCardData[] }) {
  const [type, setType] = useState<"todas" | PropertyType>("todas");

  const counts = new Map<string, number>();
  for (const p of properties) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const types = [...counts.keys()] as PropertyType[];
  const visible = type === "todas" ? properties : properties.filter((p) => p.type === type);

  if (properties.length === 0) {
    return (
      <p className="rounded-card bg-surface p-8 text-center text-sm text-text-muted shadow-card">
        Esta inmobiliaria todavía no tiene propiedades publicadas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {types.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo de propiedad">
          <Tab active={type === "todas"} onClick={() => setType("todas")}>
            Todas ({properties.length})
          </Tab>
          {types.map((t) => (
            <Tab key={t} active={type === t} onClick={() => setType(t)}>
              {PLURALS[t] ?? PROPERTY_TYPE_LABELS[t] ?? t} ({counts.get(t)})
            </Tab>
          ))}
        </div>
      )}
      <PropertyGrid properties={visible} />
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}
