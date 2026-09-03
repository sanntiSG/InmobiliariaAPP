import { formatArea } from "@/lib/utils/format";
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-media bg-surface-2 p-3.5">
          <p className="text-xs text-text-muted">{item.label}</p>
          <p className="mt-0.5 font-display text-base font-semibold tabular-nums text-text">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
