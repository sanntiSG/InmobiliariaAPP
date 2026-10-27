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
  syncValue,
  className,
  inputClassName,
}: {
  placeholder?: string;
  /** Valor inicial del texto — el componente queda no-controlado a partir de ahí (usar `key` para forzar un reset externo). */
  initialValue?: string;
  onSelect: (result: GeocodeResult) => void;
  /** Texto que el llamador usa como filtro. Elegir una sugerencia lo deja en "" (el lugar elegido reemplaza a lo tipeado). */
  onQueryChange?: (text: string) => void;
  /** El texto-filtro actual del llamador: si cambia desde afuera (quitar la etiqueta, limpiar filtros) el cuadro se vacía. */
  syncValue?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Lo último que este cuadro le avisó al llamador: lo que difiera de `syncValue` es un cambio hecho desde afuera.
  const emitted = useRef(initialValue);
  // La sugerencia elegida queda escrita en el cuadro: no hay que volver a buscarla (reabría la lista recién cerrada).
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (syncValue === undefined || syncValue === emitted.current) return;
    emitted.current = syncValue;
    // El filtro se cambió fuera del cuadro (etiqueta quitada o "Limpiar filtros"): el texto visible tiene que acompañarlo.
    setQuery(syncValue);
    setResults([]);
  }, [syncValue]);

  useEffect(() => {
    if (query === picked.current) return;
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

  function emit(text: string) {
    emitted.current = text;
    onQueryChange?.(text);
  }

  function handleSelect(result: GeocodeResult) {
    onSelect(result);
    picked.current = result.label;
    setQuery(result.label);
    setOpen(false);
    // El texto que se venía tipeando ("palerm") seguía filtrando por palabras sueltas aunque el cuadro ya mostrara el lugar
    // elegido: dejaba la búsqueda en cero sin nada que se pudiera quitar. El lugar elegido lo reemplaza.
    if (emitted.current !== "") emit("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={(e) => {
          picked.current = null;
          setQuery(e.target.value);
          emit(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Nunca debe burbujear al submit del <form> que lo contenga (ej:
          // PropertyForm) — acá Enter selecciona la primera sugerencia,
          // como cualquier buscador con autocompletado.
          e.preventDefault();
          if (open && results.length > 0) handleSelect(results[0]);
        }}
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
