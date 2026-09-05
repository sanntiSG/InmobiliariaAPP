"use client";

import { useRouter } from "next/navigation";

/** Selector de inmobiliaria — sólo lo ve el admin, para acotar la lista de propiedades a una agencia. */
export function AgencyFilterSelect({
  agencies,
  selected,
}: {
  agencies: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `/dashboard/propiedades?agencyId=${value}` : "/dashboard/propiedades");
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
