"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { MapFilters } from "@/components/map/MapFilters";
import { FilterPill } from "@/components/ui/FilterPill";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PropertyCard } from "@/components/property/PropertyCard";
import type { MapFiltersState } from "@/components/map/types";
import { filtersToSearchParams } from "@/lib/filters/state";
import { cn } from "@/lib/utils/cn";
import type { PropertyCardData } from "@/components/property/types";

/** Cuánto se espera tras el último cambio de filtros antes de pedir los resultados (igual que el mapa). */
const FILTER_DEBOUNCE_MS = 300;

const SORTS = ["recientes", "precio_asc", "precio_desc"] as const;
type Sort = (typeof SORTS)[number];
const SORT_LABELS: Record<Sort, string> = {
  recientes: "Más recientes",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
};

async function fetchListing(filters: MapFiltersState, sort: Sort, page: number, signal: AbortSignal) {
  const params = filtersToSearchParams(filters);
  params.set("sort", sort);
  params.set("page", String(page));

  const res = await fetch(`/api/properties?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("No se pudieron cargar las propiedades");
  return (await res.json()) as { items: PropertyCardData[]; total: number; page: number; pageSize: number };
}

export default function PropiedadesClient({ initialFilters, agencyName }: { initialFilters: MapFiltersState; /** Nombre de la inmobiliaria por la que se filtra (el servidor ya la validó). */ agencyName: string | null }) {
  const router = useRouter();
  const [filters, setFilters] = useState<MapFiltersState>(initialFilters);
  const [sort, setSort] = useState<Sort>("recientes");
  const [items, setItems] = useState<PropertyCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** El último pedido falló: se dice (con "Reintentar") en vez de dejar en pantalla el resultado anterior, que podía ser un "0". */
  const [failed, setFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const moreAbortRef = useRef<AbortController | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    abortRef.current?.abort();
    // Una página extra pedida con los filtros anteriores ya no vale: no tiene que sumarse a esta lista.
    moreAbortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Sincroniza con la API externa al cambiar filtros/orden — no es
    // estado derivado de props, es el disparador de un fetch real.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFailed(false);
    setMoreFailed(false);
    setLoadingMore(false);
    setPage(1);

    // El primer pedido sale enseguida; los siguientes esperan un instante por si siguen tipeando o moviendo un control
    // (antes salía uno por cada tecla o paso del deslizador y el límite de pedidos por minuto podía cortar el último).
    const delay = firstLoad.current ? 0 : FILTER_DEBOUNCE_MS;
    firstLoad.current = false;
    const timer = setTimeout(() => {
      fetchListing(filters, sort, 1, controller.signal)
        .then((data) => {
          setItems(data.items);
          setTotal(data.total);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setFailed(true);
          setLoading(false);
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, sort, retry]);

  // La dirección acompaña a los filtros (sin recargar): se puede copiar, compartir o volver a ella.
  useEffect(() => {
    const qs = filtersToSearchParams(filters).toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [filters]);

  // Volver al mapa con los mismos filtros (el mapa lee la inmobiliaria como `agency`, que valida el servidor).
  const mapHref = useMemo(() => {
    const params = filtersToSearchParams({ ...filters, agencyId: null });
    if (filters.agencyId) params.set("agency", filters.agencyId);
    const qs = params.toString();
    return `/mapa${qs ? `?${qs}` : ""}`;
  }, [filters]);

  function cycleSort() {
    const i = SORTS.indexOf(sort);
    setSort(SORTS[(i + 1) % SORTS.length]);
  }

  async function loadMore() {
    moreAbortRef.current?.abort();
    const controller = new AbortController();
    moreAbortRef.current = controller;
    setLoadingMore(true);
    setMoreFailed(false);
    const nextPage = page + 1;
    try {
      const data = await fetchListing(filters, sort, nextPage, controller.signal);
      if (controller.signal.aborted) return;
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setMoreFailed(true);
    } finally {
      // Si cambiaron los filtros mientras tanto, el efecto de arriba ya apagó esto.
      if (moreAbortRef.current === controller) setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="min-h-dvh pt-[calc(var(--header-h)+var(--safe-top))] pb-[var(--safe-bottom)]">
      <Navbar variant="immersive" />

      <div className="mx-auto max-w-7xl pb-28 pt-6 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] sm:pl-[max(1.5rem,var(--safe-left))] sm:pr-[max(1.5rem,var(--safe-right))]">
        <PageHeader
          eyebrow="Explorar"
          title={
            <>
              Propiedades para recorrer <em>antes de visitar</em>
            </>
          }
          lead="Filtrá por zona, precio y tipo. Las que tienen recorrido 360° se pueden caminar desde acá."
          className="mb-6"
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <MapFilters value={filters} onChange={setFilters} resultCount={total} className="min-w-0 flex-1" />
          <div className="flex items-center gap-2">
            <FilterPill onClick={cycleSort}>{SORT_LABELS[sort]}</FilterPill>
          </div>
        </div>

        {agencyName && filters.agencyId && (
          <div className="mt-3 flex w-fit max-w-full items-center gap-1.5 rounded-pill bg-accent py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-accent-contrast">
            <span className="truncate">Inmobiliaria: {agencyName}</span>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, agencyId: null }))}
              aria-label="Quitar el filtro de inmobiliaria y ver todo el mercado"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/15"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        <p className="mt-4 text-sm text-text-muted" aria-live="polite">
          {loading ? "Buscando…" : failed ? "No pudimos cargar los resultados" : `${total} propiedad${total === 1 ? "" : "es"} encontrada${total === 1 ? "" : "s"}`}
        </p>

        {failed ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-text-muted" role="alert">
            <p className="font-display text-lg font-semibold text-text">No pudimos cargar las propiedades</p>
            <p className="max-w-sm text-sm">Puede ser la conexión o un momento de mucha demanda. Tus filtros siguen como estaban.</p>
            <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        ) : loading ? (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="aspect-[4/3] w-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center text-text-muted">
            <p className="font-display text-lg font-semibold text-text">No encontramos propiedades</p>
            <p className="max-w-sm text-sm">Probá ampliar el rango de precio o quitar algún filtro.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  revealIndex={i % 8}
                  onSelect={() => router.push(`/propiedades/${property.slug}`)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : moreFailed ? "Reintentar" : "Cargar más"}
                </Button>
                {moreFailed && (
                  <p className="text-sm text-text-muted" role="alert">
                    No pudimos cargar más propiedades.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Siempre a la vista y al alcance del pulgar: vuelve al mapa con los mismos filtros. */}
      <Link
        href={mapHref}
        className={cn(
          buttonClasses("primary", "md"),
          "pop-in fixed left-1/2 z-30 -translate-x-1/2 gap-2 whitespace-nowrap shadow-float bottom-[calc(1.25rem+var(--safe-bottom))]"
        )}
      >
        <MapIcon className="h-4 w-4" aria-hidden />
        Volver al mapa
      </Link>
    </div>
  );
}
