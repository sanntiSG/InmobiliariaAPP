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
    bedrooms != null && { icon: <BedIcon />, label: `${bedrooms}` },
    bathrooms != null && { icon: <BathIcon />, label: `${bathrooms}` },
    area != null && { icon: <AreaIcon />, label: formatArea(area) },
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

function BedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18v2M21 18v2M3 12V7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3M13 9h5a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BathIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM4 12V6a2 2 0 0 1 2-2c1 0 1.5.6 1.7 1M3 19h18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AreaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
