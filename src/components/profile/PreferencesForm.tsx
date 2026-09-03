"use client";

import { useState } from "react";
import { FilterPill } from "@/components/ui/FilterPill";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OPERATIONS, OPERATION_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/config/filters";
import { formatPriceCompact } from "@/lib/utils/format";
import type { PreferencesInput } from "@/lib/validation/preferences";

const PRICE_BOUNDS: [number, number] = [0, 1_000_000];

export function PreferencesForm({ initial }: { initial: PreferencesInput }) {
  const [operations, setOperations] = useState(initial.operations);
  const [propertyTypes, setPropertyTypes] = useState(initial.propertyTypes);
  const [priceRange, setPriceRange] = useState<[number, number]>([
    initial.priceMin ?? PRICE_BOUNDS[0],
    initial.priceMax ?? PRICE_BOUNDS[1],
  ]);
  const [minRooms, setMinRooms] = useState(initial.minRooms ?? null);
  const [locationsText, setLocationsText] = useState(initial.locations.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const payload: PreferencesInput = {
      operations,
      propertyTypes,
      locations: locationsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
      priceMin: priceRange[0] !== PRICE_BOUNDS[0] ? priceRange[0] : undefined,
      priceMax: priceRange[1] !== PRICE_BOUNDS[1] ? priceRange[1] : undefined,
      minRooms: minRooms ?? undefined,
    };
    const res = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
      <div>
        <p className="mb-2 text-sm font-medium text-text">Operación</p>
        <div className="flex flex-wrap gap-2">
          {OPERATIONS.map((o) => (
            <FilterPill key={o} type="button" active={operations.includes(o)} onClick={() => toggle(operations, o, setOperations)}>
              {OPERATION_LABELS[o]}
            </FilterPill>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">Tipo de propiedad</p>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((t) => (
            <FilterPill key={t} type="button" active={propertyTypes.includes(t)} onClick={() => toggle(propertyTypes, t, setPropertyTypes)}>
              {PROPERTY_TYPE_LABELS[t]}
            </FilterPill>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">Rango de precio</p>
        <RangeSlider
          min={PRICE_BOUNDS[0]}
          max={PRICE_BOUNDS[1]}
          step={5000}
          value={priceRange}
          onChange={setPriceRange}
          formatValue={(n) => (n >= PRICE_BOUNDS[1] ? `${formatPriceCompact(n)}+` : formatPriceCompact(n))}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">Ambientes mínimos</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <FilterPill key={n} type="button" active={minRooms === n} onClick={() => setMinRooms(minRooms === n ? null : n)}>
              {n}+ amb.
            </FilterPill>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-text">Barrios de interés</label>
        <Input
          value={locationsText}
          onChange={(e) => setLocationsText(e.target.value)}
          placeholder="Palermo, Belgrano, San Isidro..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar preferencias"}
        </Button>
        {saved && <span className="text-sm text-success">Guardado ✓</span>}
      </div>
    </div>
  );
}
