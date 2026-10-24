import { formatArea } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail } from "./types";

export function PropertyFeaturesGrid({ features }: { features: PropertyDetail["features"] }) {
  const items: { label: string; value: string }[] = [
    features.rooms != null && { label: "Ambientes", value: String(features.rooms) },
    features.bedrooms != null && { label: "Dormitorios", value: String(features.bedrooms) },
    features.bathrooms != null && { label: "Baños", value: String(features.bathrooms) },
    features.garages != null && features.garages > 0 && { label: "Cocheras", value: String(features.garages) },
    features.coveredArea != null && { label: "Sup. cubierta", value: formatArea(features.coveredArea) },
    features.totalArea != null && { label: "Sup. total", value: formatArea(features.totalArea) },
    features.floor != null && { label: "Piso", value: String(features.floor) },
    features.age != null && { label: "Antigüedad", value: features.age === 0 ? "A estrenar" : `${features.age} años` },
    features.orientation && { label: "Orientación", value: features.orientation },
  ].filter(Boolean) as { label: string; value: string }[];

  if (items.length === 0) return null;

  // Mosaico de 1 px: el color del grupo se ve sólo en las juntas. Para que no queden celdas vacías (que dejarían un
  // hueco del color de las juntas), la última se estira lo que haga falta en cada cantidad de columnas.
  const n = items.length;
  const lastSpan = cn(
    n % 2 === 1 && "col-span-2",
    n % 3 === 1 ? "sm:col-span-3" : n % 3 === 2 ? "sm:col-span-2" : n % 2 === 1 ? "sm:col-span-1" : ""
  );

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-media bg-border-hi shadow-[0_0_0_1px_var(--border-hi)] sm:grid-cols-3">
      {items.map((item, i) => (
        <div key={item.label} className={cn("bg-surface p-3.5", i === n - 1 && lastSpan)}>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-subtle">{item.label}</p>
          <p className="mt-1 font-mono text-base font-medium text-text">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
