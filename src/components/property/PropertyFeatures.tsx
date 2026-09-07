import { BedDouble, Bath, Ruler } from "lucide-react";
import { formatArea } from "@/lib/utils/format";

type Props = {
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  className?: string;
};

/** Fila de features con chips grises — mismo lenguaje que la referencia visual. */
export function PropertyFeatures({ bedrooms, bathrooms, area, className }: Props) {
  const items = [
    bedrooms != null && { icon: <BedDouble aria-hidden />, label: `${bedrooms}` },
    bathrooms != null && { icon: <Bath aria-hidden />, label: `${bathrooms}` },
    area != null && { icon: <Ruler aria-hidden />, label: formatArea(area) },
  ].filter(Boolean) as { icon: React.ReactNode; label: string }[];

  if (items.length === 0) return null;

  return (
    <div className={className ?? "flex items-center gap-2"}>
      {items.map((item, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-text-muted"
        >
          <span className="text-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>
          <span className="tabular-nums text-text">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
