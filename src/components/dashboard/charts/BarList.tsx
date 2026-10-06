import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type BarItem = {
  label: string;
  value: number;
  /** Texto del valor (por defecto, el número con separador de miles). */
  valueText?: string;
  sublabel?: string;
  href?: string;
};

const fmt = new Intl.NumberFormat("es-AR");

/**
 * Ranking en barras horizontales: una sola serie (todas en el acento), barras
 * finas con el extremo redondeado y el valor al final de cada una. Sin
 * `overflow: hidden` sobre el texto: la etiqueta vive arriba de la barra.
 */
export function BarList({ items, emptyText = "Sin datos todavía.", className }: { items: BarItem[]; emptyText?: string; className?: string }) {
  if (items.length === 0) return <p className="text-sm text-text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ol className={cn("flex flex-col gap-4", className)}>
      {items.map((item, i) => {
        const label = (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text group-hover:text-accent">{item.label}</span>
        );
        return (
          <li key={`${item.label}-${i}`} className="group flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              {item.href ? (
                <Link href={item.href} className="flex min-w-0 flex-1">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="shrink-0 text-sm font-semibold text-text">{item.valueText ?? fmt.format(item.value)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-2" aria-hidden>
              <div
                className="h-full rounded-r-[4px] rounded-l-full bg-accent transition-[width] duration-500 [transition-timing-function:var(--ease-out)]"
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </div>
            {item.sublabel && <p className="text-xs text-text-muted">{item.sublabel}</p>}
          </li>
        );
      })}
    </ol>
  );
}
