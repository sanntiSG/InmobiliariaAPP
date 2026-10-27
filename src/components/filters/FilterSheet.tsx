"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterPill } from "@/components/ui/FilterPill";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Sheet } from "@/components/ui/Sheet";
import { AMENITIES, AMENITY_LABELS, CURRENCIES, OPERATIONS, OPERATION_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type Amenity, type Currency } from "@/config/filters";
import { areaBounds, priceBounds } from "@/lib/filters/bounds";
import type { Facets } from "@/lib/filters/facets";
import { DEFAULT_FILTERS, RECENT_DAYS, activeChips, countActiveFilters, type PropertyFiltersState } from "@/lib/filters/state";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { formatPriceCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  value: PropertyFiltersState;
  onChange: (next: PropertyFiltersState) => void;
  /** Cuántas propiedades dan los filtros de ahora (para el botón de abajo). */
  resultCount?: number;
};

// ─── Opciones reales (ciudades, barrios, comodidades, precios) ──────────────────────────────────

const facetCache = new Map<string, { at: number; data: Facets }>();
const FACET_TTL_MS = 5 * 60_000;

/** Pide las opciones reales recién cuando se abre la hoja y las recuerda un rato: abrirla de nuevo es instantáneo. */
function useFacets(open: boolean, agencyId: string | null): { facets: Facets | null; failed: boolean } {
  const key = agencyId ?? "all";
  const [state, setState] = useState<{ key: string; facets: Facets | null; failed: boolean }>(() => ({ key, facets: facetCache.get(key)?.data ?? null, failed: false }));

  useEffect(() => {
    if (!open) return;
    const cached = facetCache.get(key);
    if (cached && Date.now() - cached.at < FACET_TTL_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lo que ya se pidió se muestra al instante al volver a abrir
      setState({ key, facets: cached.data, failed: false });
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/properties/facets${agencyId ? `?agencyId=${agencyId}` : ""}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Facets>) : Promise.reject(new Error("facets"))))
      .then((data) => {
        facetCache.set(key, { at: Date.now(), data });
        setState({ key, facets: data, failed: false });
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setState((s) => ({ ...s, key, failed: true }));
      });
    return () => ctrl.abort();
  }, [open, key, agencyId]);

  return { facets: state.key === key ? state.facets : null, failed: state.failed };
}

// ─── Piezas ─────────────────────────────────────────────────────────────────────────────────────

const pill = "h-9 px-3.5 text-[13px]";

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** "Mínimo de dormitorios": 1+ a 5+, y volver a tocar el elegido lo quita. */
function MinRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text">{label}</span>
      <div className="flex gap-1.5" role="group" aria-label={`Mínimo de ${label.toLowerCase()}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <FilterPill key={n} className={cn(pill, "min-w-10 justify-center px-2.5")} active={value === n} onClick={() => onChange(value === n ? null : n)}>
            {n}+
          </FilterPill>
        ))}
      </div>
    </div>
  );
}

const selectCls =
  "h-11 w-full rounded-media border border-border-hi bg-surface-sunken px-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent/60 focus:ring-[3px] focus:ring-accent/15 disabled:opacity-50";

/**
 * Todos los filtros en una sola hoja: desde abajo en el celular, desde la derecha en pantallas grandes (el mapa o el listado
 * siguen a la vista). Arriba, lo que ya está aplicado como etiquetas que se quitan de a una; abajo, siempre a la mano, limpiar y
 * ver los resultados. Los cambios se aplican en el momento. Las opciones de ubicación, comodidades y precio salen de lo que hay
 * publicado de verdad (`/api/properties/facets`), no de listas escritas a mano.
 */
export function FilterSheet({ open, onClose, value, onChange, resultCount }: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  const { facets, failed } = useFacets(open, value.agencyId);
  const chips = useMemo(() => activeChips(value), [value]);
  const active = countActiveFilters(value);

  const set = (patch: Partial<PropertyFiltersState>) => onChange({ ...value, ...patch });
  const toggleType = (t: (typeof PROPERTY_TYPES)[number]) => set({ types: value.types.includes(t) ? value.types.filter((x) => x !== t) : [...value.types, t] });
  const toggleAmenity = (a: Amenity) => set({ amenities: value.amenities.includes(a) ? value.amenities.filter((x) => x !== a) : [...value.amenities, a] });
  const clearAll = () => onChange({ ...DEFAULT_FILTERS, q: value.q, agencyId: value.agencyId });

  // Precio: el rango sale de lo publicado en esa moneda (y operación). Al llegar a un extremo deja de filtrar por ese lado.
  const price = priceBounds(facets, value.currency, value.operation);
  const priceValue: [number, number] = price ? [Math.max(price.min, value.priceMin ?? price.min), Math.min(price.max, value.priceMax ?? price.max)] : [0, 0];
  const area = areaBounds(facets);
  const areaValue: [number, number] = [Math.max(area.min, value.areaMin ?? area.min), Math.min(area.max, value.areaMax ?? area.max)];

  const hoods = (facets?.neighborhoods ?? []).filter((h) => !value.city || h.city === value.city);
  // Si la dirección trae una ciudad o un barrio que ya no está publicado, se muestra igual para poder quitarlo.
  const cities = facets ? [...new Set([...facets.cities.map((c) => c.value), ...(value.city ? [value.city] : [])])] : value.city ? [value.city] : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      side={wide ? "right" : "bottom"}
      // Siempre a la mano: limpiar y ver cuántas propiedades quedan.
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={clearAll}
            disabled={active === 0}
            className="min-h-11 text-sm font-medium text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Limpiar filtros
          </button>
          <Button size="sm" onClick={onClose}>
            {resultCount != null ? <>Ver <span className="font-mono">{resultCount}</span> {resultCount === 1 ? "propiedad" : "propiedades"}</> : "Ver resultados"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7 pt-1">
        {/* Lo aplicado, para quitarlo de a uno */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Filtros aplicados">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.clear(value))}
                aria-label={`Quitar ${c.label}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-accent/30 bg-accent-soft pl-3 pr-2 text-xs font-semibold text-accent transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] pointer-coarse:h-9"
              >
                {c.label}
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
          </div>
        )}

        <Section title="Operación">
          <div className="flex flex-wrap gap-2">
            <FilterPill className={pill} active={value.operation === "todas"} onClick={() => set({ operation: "todas" })}>
              Todas
            </FilterPill>
            {OPERATIONS.map((op) => (
              <FilterPill key={op} className={pill} active={value.operation === op} onClick={() => set({ operation: op })}>
                {OPERATION_LABELS[op]}
              </FilterPill>
            ))}
          </div>
        </Section>

        <Section title="Tipo de propiedad" hint={value.types.length > 0 ? `${value.types.length} elegido${value.types.length === 1 ? "" : "s"}` : "Podés elegir varios"}>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map((t) => (
              <FilterPill key={t} className={pill} active={value.types.includes(t)} onClick={() => toggleType(t)}>
                {PROPERTY_TYPE_LABELS[t]}
              </FilterPill>
            ))}
          </div>
        </Section>

        <Section title="Ubicación" hint={facets ? `${facets.cities.length} ${facets.cities.length === 1 ? "ciudad" : "ciudades"}` : undefined}>
          <div className="flex flex-col gap-2.5">
            <label className="sr-only" htmlFor="filter-city">
              Ciudad
            </label>
            <select id="filter-city" value={value.city ?? ""} onChange={(e) => set({ city: e.target.value || null, neighborhood: null })} className={selectCls} disabled={!facets && !value.city}>
              <option value="">{facets || value.city ? "Todas las ciudades" : failed ? "No se pudieron cargar" : "Cargando…"}</option>
              {cities.map((c) => {
                const n = facets?.cities.find((x) => x.value === c)?.count;
                return (
                  <option key={c} value={c}>
                    {c}
                    {n ? ` (${n})` : ""}
                  </option>
                );
              })}
            </select>
            <label className="sr-only" htmlFor="filter-hood">
              Barrio
            </label>
            <select id="filter-hood" value={value.neighborhood ?? ""} onChange={(e) => set({ neighborhood: e.target.value || null })} className={selectCls} disabled={!value.city}>
              <option value="">{value.city ? "Todos los barrios" : "Elegí una ciudad para ver sus barrios"}</option>
              {value.neighborhood && !hoods.some((h) => h.value === value.neighborhood) && <option value={value.neighborhood}>{value.neighborhood}</option>}
              {hoods.map((h) => (
                <option key={`${h.city}|${h.value}`} value={h.value}>
                  {h.value} ({h.count})
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Precio" hint={value.currency ? undefined : "Elegí una moneda"}>
          <div className="flex flex-wrap gap-2">
            <FilterPill className={pill} active={value.currency === null} onClick={() => set({ currency: null, priceMin: null, priceMax: null })}>
              Cualquiera
            </FilterPill>
            {CURRENCIES.map((c: Currency) => (
              <FilterPill key={c} className={pill} active={value.currency === c} onClick={() => set({ currency: c, priceMin: null, priceMax: null })}>
                {c === "USD" ? "Dólares (US$)" : "Pesos ($)"}
              </FilterPill>
            ))}
          </div>
          {value.currency &&
            (price ? (
              <RangeSlider
                min={price.min}
                max={price.max}
                step={price.step}
                value={priceValue}
                ariaLabels={["Precio mínimo", "Precio máximo"]}
                onChange={([lo, hi]) => set({ priceMin: lo <= price.min ? null : lo, priceMax: hi >= price.max ? null : hi })}
                formatValue={(n) => (n >= price.max ? `${formatPriceCompact(n, value.currency!)}+` : formatPriceCompact(n, value.currency!))}
              />
            ) : (
              <p className="text-sm text-text-muted">{facets ? `No hay propiedades publicadas en ${value.currency === "USD" ? "dólares" : "pesos"}${value.operation !== "todas" ? ` para ${OPERATION_LABELS[value.operation].toLowerCase()}` : ""}.` : "Cargando…"}</p>
            ))}
          {value.currency && value.operation === "todas" && price && <p className="text-xs text-text-muted">Incluye ventas y alquileres: para acotar mejor, elegí una operación.</p>}
        </Section>

        <Section title="Ambientes y espacios">
          <div className="flex flex-col gap-2.5">
            <MinRow label="Ambientes" value={value.minRooms} onChange={(v) => set({ minRooms: v })} />
            <MinRow label="Dormitorios" value={value.minBedrooms} onChange={(v) => set({ minBedrooms: v })} />
            <MinRow label="Baños" value={value.minBathrooms} onChange={(v) => set({ minBathrooms: v })} />
            <MinRow label="Cocheras" value={value.minGarages} onChange={(v) => set({ minGarages: v })} />
          </div>
        </Section>

        <Section title="Superficie">
          <RangeSlider
            min={area.min}
            max={area.max}
            step={area.step}
            value={areaValue}
            ariaLabels={["Superficie mínima", "Superficie máxima"]}
            onChange={([lo, hi]) => set({ areaMin: lo <= area.min ? null : lo, areaMax: hi >= area.max ? null : hi })}
            formatValue={(n) => (n >= area.max ? `${n} m²+` : `${n} m²`)}
          />
        </Section>

        <Section title="Comodidades" hint="Tienen que estar todas">
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => {
              const n = facets?.amenities[a];
              const selected = value.amenities.includes(a);
              const none = facets != null && !n && !selected;
              return (
                <FilterPill key={a} className={cn(pill, none && "opacity-45")} active={selected} disabled={none} onClick={() => toggleAmenity(a)}>
                  {AMENITY_LABELS[a]}
                  {n ? <span className="font-mono text-[11px] opacity-60">{n}</span> : null}
                </FilterPill>
              );
            })}
          </div>
        </Section>

        <Section title="Más opciones">
          <div className="flex flex-wrap gap-2">
            <FilterPill className={pill} active={value.tour3dOnly} onClick={() => set({ tour3dOnly: !value.tour3dOnly })}>
              Con recorrido 360°
            </FilterPill>
            <FilterPill className={pill} active={value.ambientOnly} onClick={() => set({ ambientOnly: !value.ambientOnly })}>
              Con portada viva
            </FilterPill>
            <FilterPill className={pill} active={value.videoOnly} onClick={() => set({ videoOnly: !value.videoOnly })}>
              Con video
            </FilterPill>
            <FilterPill className={pill} active={value.recentOnly} onClick={() => set({ recentOnly: !value.recentOnly })}>
              Publicadas hace poco
            </FilterPill>
          </div>
          {value.recentOnly && <p className="text-xs text-text-muted">Las de los últimos {RECENT_DAYS} días.</p>}
        </Section>
      </div>
    </Sheet>
  );
}

