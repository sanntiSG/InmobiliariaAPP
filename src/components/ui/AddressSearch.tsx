"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./Input";
import { cn } from "@/lib/utils/cn";

export type GeocodeResult = {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  province?: string;
  neighborhood?: string;
};

const DEBOUNCE_MS = 500;

/** Buscador de direcciones en Argentina (Nominatim vía /api/geocode). */
export function AddressSearch({
  placeholder = "Buscar dirección o barrio…",
  initialValue = "",
  onSelect,
  /** Se dispara en cada tecla, además de la búsqueda — para usos "duales"
   *  donde el mismo texto también filtra otra cosa (ej: propiedades por texto). */
  onQueryChange,
  className,
  inputClassName,
}: {
  placeholder?: string;
  /** Valor inicial del texto — el componente queda no-controlado a partir de ahí (usar `key` para forzar un reset externo). */
  initialValue?: string;
  onSelect: (result: GeocodeResult) => void;
  onQueryChange?: (text: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el dropdown con el largo del texto; no dispara un fetch
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        // abort u otro error de red — silencioso, el usuario puede seguir tipeando
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(result: GeocodeResult) {
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label="Buscar dirección en Argentina"
        autoComplete="off"
        className={inputClassName}
      />
      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-media border border-border bg-surface shadow-float">
          {loading ? (
            <p className="px-4 py-3 text-sm text-text-muted">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-muted">Sin resultados en Argentina.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.lat}-${r.lng}-${i}`}
                type="button"
                onClick={() => handleSelect(r)}
                className="block w-full truncate px-4 py-2.5 text-left text-sm text-text hover:bg-surface-2"
              >
                {r.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
