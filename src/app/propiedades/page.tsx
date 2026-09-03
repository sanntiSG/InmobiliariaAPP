"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { MapFilters } from "@/components/map/MapFilters";
import { FilterPill } from "@/components/ui/FilterPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PropertyCard } from "@/components/property/PropertyCard";
import { DEFAULT_FILTERS, type MapFiltersState } from "@/components/map/types";
import { filtersToSearchParams } from "@/lib/filters/state";
import type { PropertyCardData } from "@/components/property/types";

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

export default function PropiedadesPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>("recientes");
  const [items, setItems] = useState<PropertyCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Sincroniza con la API externa al cambiar filtros/orden — no es
    // estado derivado de props, es el disparador de un fetch real.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setPage(1);

    fetchListing(filters, sort, 1, controller.signal)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [filters, sort]);

  function cycleSort() {
    const i = SORTS.indexOf(sort);
    setSort(SORTS[(i + 1) % SORTS.length]);
  }

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await fetchListing(filters, sort, nextPage, new AbortController().signal);
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="min-h-dvh">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <MapFilters value={filters} onChange={setFilters} resultCount={total} className="flex-1" />
          <div className="flex items-center gap-2">
            <FilterPill onClick={cycleSort}>{SORT_LABELS[sort]}</FilterPill>
            <Link href="/mapa" className="hidden shrink-0 text-sm font-medium text-accent hover:underline sm:inline">
              Ver en mapa
            </Link>
          </div>
        </div>

        <p className="mt-4 text-sm text-text-muted">
          {loading ? "Buscando…" : `${total} propiedad${total === 1 ? "" : "es"} encontrada${total === 1 ? "" : "s"}`}
        </p>

        {loading ? (
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
              {items.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onSelect={() => router.push(`/propiedades/${property.slug}`)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
