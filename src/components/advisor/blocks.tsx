"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FlaskConical, Info, TrendingDown, TrendingUp } from "lucide-react";
import { BarList } from "@/components/dashboard/charts/BarList";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { DiagnosticCard } from "@/components/dashboard/DiagnosticCard";
import { PropertyCard } from "@/components/property/PropertyCard";
import { cn } from "@/lib/utils/cn";
import type { AdvisorBlock, PropertyRef, TableCell, Tone } from "@/lib/advisor/types";

const TONE_TEXT: Record<Tone, string> = { good: "text-success", bad: "text-danger", neutral: "text-text" };
const TONE_DOT: Record<Tone, string> = { good: "bg-success", bad: "bg-danger", neutral: "bg-text-muted" };

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

const cellText = (c: TableCell) => (typeof c === "object" ? c.text : String(c));
const cellTone = (c: TableCell): Tone => (typeof c === "object" ? (c.tone ?? "neutral") : "neutral");

function PropertyRow({ item }: { item: PropertyRef }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Link href={item.href} className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-media bg-surface-2" tabIndex={-1} aria-hidden>
        {item.image ? <Image src={item.image} alt="" fill sizes="72px" className="object-cover" /> : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={item.href} className="truncate text-sm font-semibold text-text hover:text-accent">
          {item.title}
        </Link>
        <p className="truncate text-xs text-text-muted">
          <span className="font-display font-semibold text-text">{item.price}</span>
          {item.place ? ` · ${item.place}` : ""}
        </p>
        {item.chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {item.chips.map((chip) => (
              <li key={chip} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {chip}
              </li>
            ))}
          </ul>
        )}
        {item.note && (
          <p className="flex items-start gap-1.5 text-xs text-text-muted">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[item.tone ?? "neutral"])} aria-hidden />
            {item.note}
          </p>
        )}
        {item.links && item.links.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
            {item.links.map((l) => (
              <Link key={l.label} href={l.href} className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent hover:underline">
                {l.label}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function Delta({ value }: { value: number }) {
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", value === 0 ? "text-text-muted" : up ? "text-success" : "text-danger")}>
      {value !== 0 && <Icon className="h-3 w-3" aria-hidden />}
      {up ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value)} %
    </span>
  );
}

/** Un bloque de una respuesta. Los de datos reusan los componentes del panel (mismo aspecto, mismos números). */
export function BlockView({ block, onOpenProperty }: { block: AdvisorBlock; onOpenProperty: (slug: string) => void }) {
  switch (block.type) {
    case "text":
      return <p className="text-sm text-text-muted">{block.text}</p>;

    case "caveat":
      return (
        <p className="flex items-start gap-2 rounded-media bg-surface-2 px-3.5 py-2.5 text-xs text-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {block.text}
        </p>
      );

    case "metrics":
      return (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {block.items.map((m) => (
            <div key={m.label} className="flex min-w-0 flex-col gap-1 rounded-media bg-surface px-3.5 py-3 shadow-card">
              <dt className="truncate text-xs text-text-muted">{m.label}</dt>
              <dd className={cn("font-display text-xl font-semibold tabular-nums", TONE_TEXT[m.tone ?? "neutral"])}>{m.value}</dd>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                {m.delta != null && <Delta value={m.delta} />}
                {m.hint && <span>{m.hint}</span>}
              </div>
            </div>
          ))}
        </dl>
      );

    case "trend":
      return (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <TrendChart points={block.points} label={block.label} />
        </div>
      );

    case "bars":
      return (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <BarList items={block.items} />
        </div>
      );

    case "table":
      return (
        <div className="rounded-card bg-surface p-4 shadow-card">
          {block.caption && <p className="mb-2 text-xs font-medium text-text-muted">{block.caption}</p>}
          <table className="advisor-table w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                {block.columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("pb-2 font-medium", c.align === "right" && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {block.columns.map((c) => {
                    const cell = row[c.key] ?? "—";
                    return (
                      <td key={c.key} data-label={c.label} className={cn("py-2 align-top tabular-nums", c.align === "right" && "text-right", TONE_TEXT[cellTone(cell)], cellTone(cell) !== "neutral" && "font-semibold")}>
                        {cellText(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "properties":
      return (
        <div className="rounded-card bg-surface p-4 shadow-card">
          {block.title && <p className="mb-3 text-xs font-semibold text-text-muted">{block.title}</p>}
          <ul className="divide-y divide-border">
            {block.items.map((item) => (
              <PropertyRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      );

    case "cards":
      return (
        <div className="flex flex-col gap-2">
          {block.title && <p className="text-xs font-semibold text-text-muted">{block.title}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {block.items.map((p) => (
              <PropertyCard key={p.id} property={p} onSelect={() => onOpenProperty(p.slug)} />
            ))}
          </div>
        </div>
      );

    case "diagnostics":
      return (
        <div className="flex flex-col gap-3">
          {block.items.map((d) => (
            <DiagnosticCard key={d.id} diagnostic={d} compact />
          ))}
        </div>
      );

    case "timeline":
      return (
        <ol className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
          {block.items.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[e.tone ?? "neutral"])} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium text-text">
                  {e.href ? (
                    <Link href={e.href} className="hover:text-accent">
                      {e.title}
                    </Link>
                  ) : (
                    e.title
                  )}
                </p>
                {e.detail && <p className="text-xs text-text-muted">{e.detail}</p>}
                <time dateTime={e.at} className="text-xs text-text-muted">
                  {dateFmt.format(new Date(e.at))}
                </time>
              </div>
            </li>
          ))}
        </ol>
      );

    case "simulation":
      return (
        <div className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-text">{block.title}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
              <FlaskConical className="h-3 w-3" aria-hidden />
              Hipotético
            </span>
          </div>
          <dl className="flex flex-col gap-1.5">
            {block.rows.map((r) => (
              <div key={r.label} className="flex gap-3 text-sm">
                <dt className="w-14 shrink-0 font-semibold tabular-nums text-text">{r.label}</dt>
                <dd className="min-w-0 text-text-muted">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-muted">{block.note}</p>
        </div>
      );
  }
}
