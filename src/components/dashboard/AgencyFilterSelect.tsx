"use client";

import { useRouter } from "next/navigation";

/** Selector de inmobiliaria — sólo lo ve el admin, para acotar la lista de propiedades a una agencia. */
export function AgencyFilterSelect({
  agencies,
  selected,
  basePath = "/dashboard/propiedades",
}: {
  agencies: { id: string; name: string }[];
  selected: string;
  /** Ruta a la que se navega con `?agencyId=` (por defecto, el listado de propiedades). */
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `${basePath}?agencyId=${value}` : basePath);
      }}
      className="h-10 rounded-pill border border-border bg-surface px-4 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
    >
      <option value="">Todas las inmobiliarias</option>
      {agencies.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
