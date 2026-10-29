"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterPill } from "@/components/ui/FilterPill";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Sheet } from "@/components/ui/Sheet";
import { NoResults } from "@/components/filters/NoResults";
import { AMENITIES, AMENITY_LABELS, CURRENCIES, OPERATIONS, OPERATION_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type Amenity, type Currency } from "@/config/filters";
import { areaBounds, priceBounds } from "@/lib/filters/bounds";
import type { Facets } from "@/lib/filters/facets";
import { DEFAULT_FILTERS, RECENT_DAYS, activeChips, withOperation, type PropertyFiltersState } from "@/lib/filters/state";
import { BEACH_FILTER_OPTIONS, NIGHTLY_RULE } from "@/config/pricing";
import { checkRange, todayAr } from "@/lib/availability";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { formatPriceCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  value: PropertyFiltersState;
  onChange: (next: PropertyFiltersState) => void;
  /** Cuántas propiedades dan los filtros de ahora (para el botón de abajo). Sin número = todavía se está buscando. */
  resultCount?: number;
  /** Sólo en el mapa: el centro de lo que se mira y cómo ir a otra zona, para ofrecer "la zona más cercana donde sí hay". */
  center?: { lng: number; lat: number } | null;
  onFlyTo?: (lng: number, lat: number) => void;
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

/**
 * "Mínimo de dormitorios": 1+ a 5+, y volver a tocar el elegido lo quita. En pantallas angostas (menos de 420 px) la etiqueta va
 * arriba y los cinco botones se reparten el ancho: antes, etiqueta y botones iban en una sola fila que no se achicaba y, con la
 * tipografía ancha, se salía del panel y aparecía un desplazamiento horizontal.
 */
function MinRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3">
      <span className="text-sm text-text">{label}</span>
      <div className="grid grid-cols-5 gap-1.5 min-[420px]:flex min-[420px]:shrink-0" role="group" aria-label={`Mínimo de ${label.toLowerCase()}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <FilterPill key={n} className={cn(pill, "w-full min-w-0 justify-center px-0 min-[420px]:w-auto min-[420px]:min-w-10 min-[420px]:px-2.5")} active={value === n} onClick={() => onChange(value === n ? null : n)}>
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
 * "Libre en mis fechas": del día X al día Y. Sólo muestra alquileres que estén libres TODOS esos días (no marcados no disponibles y
 * sin un período ocupado que se pise). No reserva nada. Mientras falta una de las dos fechas queda un borrador local: el filtro se
 * aplica cuando están las dos y bien ordenadas.
 */
function FreeDatesSection({ from, to, onChange }: { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void }) {
  const [draft, setDraft] = useState({ from: from ?? "", to: to ?? "" });
  // Si el filtro cambia desde afuera (quitar la etiqueta, "Limpiar filtros") el borrador lo acompaña.
  const [seen, setSeen] = useState({ from, to });
  if (seen.from !== from || seen.to !== to) {
    setSeen({ from, to });
    setDraft({ from: from ?? "", to: to ?? "" });
  }
  const today = todayAr();

  function update(next: { from: string; to: string }) {
    setDraft(next);
    if (!next.from && !next.to) return onChange(null, null);
    if (next.from && next.to && checkRange(next) === null) onChange(next.from, next.to);
  }

  const incomplete = (!!draft.from !== !!draft.to) || (!!draft.from && !!draft.to && checkRange(draft) !== null);
  return (
    <Section title="Libre en mis fechas" hint="Sólo alquileres">
      {/* Una columna en pantallas angostas: los campos de fecha del celular tienen un ancho mínimo propio y dos juntos se salían. */}
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-text-muted">
          Desde
          <input type="date" min={today} value={draft.from} onChange={(e) => update({ from: e.target.value, to: draft.to && e.target.value > draft.to ? "" : draft.to })} className={selectCls} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-text-muted">
          Hasta
          <input type="date" min={draft.from || today} value={draft.to} onChange={(e) => update({ from: draft.from, to: e.target.value })} className={selectCls} />
        </label>
      </div>
      <p className={cn("text-xs", incomplete ? "text-warning" : "text-text-muted")}>
        {incomplete ? "Elegí las dos fechas para aplicar el filtro." : "Se muestran los alquileres que están libres todos esos días. No se reserva nada."}
      </p>
    </Section>
  );
}

/**
 * Todos los filtros en una sola hoja: desde abajo en el celular, desde la derecha en pantallas grandes (el mapa o el listado
 * siguen a la vista). Arriba, lo que ya está aplicado como etiquetas que se quitan de a una; abajo, siempre a la mano, limpiar y
 * ver los resultados. Los cambios se aplican en el momento. Las opciones de ubicación, comodidades y precio salen de lo que hay
 * publicado de verdad (`/api/properties/facets`), no de listas escritas a mano.
 */
export function FilterSheet({ open, onClose, value, onChange, resultCount, center, onFlyTo }: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  const { facets, failed } = useFacets(open, value.agencyId);
  const chips = useMemo(() => activeChips(value), [value]);

  const set = (patch: Partial<PropertyFiltersState>) => onChange({ ...value, ...patch });
  const toggleType = (t: (typeof PROPERTY_TYPES)[number]) => set({ types: value.types.includes(t) ? value.types.filter((x) => x !== t) : [...value.types, t] });
  const toggleAmenity = (a: Amenity) => set({ amenities: value.amenities.includes(a) ? value.amenities.filter((x) => x !== a) : [...value.amenities, a] });
  // Limpia todo lo que se ve como etiqueta (también el texto de búsqueda); la inmobiliaria tiene su propia etiqueta aparte.
  const clearAll = () => onChange({ ...DEFAULT_FILTERS, agencyId: value.agencyId });

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
            disabled={chips.length === 0}
            className="min-h-11 text-sm font-medium text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Limpiar filtros
          </button>
          <Button size="sm" onClick={onClose}>
            {resultCount === 0 ? "Cerrar" : resultCount != null ? <>Ver <span className="font-mono">{resultCount}</span> {resultCount === 1 ? "propiedad" : "propiedades"}</> : "Ver resultados"}
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

        {/* Sin resultados: en vez de un "Ver 0 propiedades" que parece un error, qué filtro quitar y dónde sí hay. */}
        {resultCount === 0 && (
          <NoResults
            compact
            filters={value}
            center={center}
            onChange={onChange}
            onFlyTo={(lng, lat) => {
              onFlyTo?.(lng, lat);
              onClose();
            }}
            className="rounded-card bg-surface-2/60 px-3"
          />
        )}

        <Section title="Operación">
          <div className="flex flex-wrap gap-2">
            <FilterPill className={pill} active={value.operation === "todas"} onClick={() => onChange(withOperation(value, "todas"))}>
              Todas
            </FilterPill>
            {OPERATIONS.map((op) => (
              <FilterPill key={op} className={pill} active={value.operation === op} onClick={() => onChange(withOperation(value, op))}>
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

        <Section title={value.operation === "alquiler_temporal" ? "Presupuesto por noche" : "Precio"} hint={value.operation !== "todas" && !value.currency ? "Elegí una moneda" : undefined}>
          {value.operation === "todas" ? (
            // Un monto de venta, uno por mes y uno por noche no se pueden comparar: el precio se elige DENTRO de una operación.
            <p className="rounded-media bg-surface-2 px-3.5 py-3 text-sm text-text-muted">Elegí una operación (venta, alquiler o alquiler temporal) para filtrar por precio: un monto de venta, uno por mes y uno por noche no se pueden comparar entre sí.</p>
          ) : (
            <>
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
                    ariaLabels={[value.operation === "alquiler_temporal" ? "Precio mínimo por noche" : "Precio mínimo", value.operation === "alquiler_temporal" ? "Precio máximo por noche" : "Precio máximo"]}
                    onChange={([lo, hi]) => set({ priceMin: lo <= price.min ? null : lo, priceMax: hi >= price.max ? null : hi })}
                    formatValue={(n) => {
                      const text = n >= price.max ? `${formatPriceCompact(n, value.currency!)}+` : formatPriceCompact(n, value.currency!);
                      return value.operation === "alquiler_temporal" ? `${text}/noche` : value.operation === "alquiler" ? `${text}/mes` : text;
                    }}
                  />
                ) : (
                  <p className="text-sm text-text-muted">{facets ? `No hay propiedades publicadas en ${value.currency === "USD" ? "dólares" : "pesos"} para ${OPERATION_LABELS[value.operation].toLowerCase()}.` : "Cargando…"}</p>
                ))}
              {value.operation === "alquiler_temporal" && <p className="text-xs text-text-muted">{NIGHTLY_RULE}</p>}
            </>
          )}
        </Section>

        {(value.beachMax != null || (facets?.beachCount ?? 0) > 0) && (
          <Section title="Distancia a la playa" hint="Sólo las que lo informan">
            <div className="flex flex-wrap gap-2">
              <FilterPill className={pill} active={value.beachMax === null} onClick={() => set({ beachMax: null })}>
                Cualquiera
              </FilterPill>
              {BEACH_FILTER_OPTIONS.map((m) => (
                <FilterPill key={m} className={pill} active={value.beachMax === m} onClick={() => set({ beachMax: value.beachMax === m ? null : m })}>
                  Hasta {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                </FilterPill>
              ))}
            </div>
          </Section>
        )}

        {value.operation !== "venta" && <FreeDatesSection from={value.from} to={value.to} onChange={(from, to) => set({ from, to })} />}

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

