"use client";

import { useMemo, useState } from "react";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FilterPill } from "@/components/ui/FilterPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { ImageUploader, type UploadedImage } from "./ImageUploader";
import { IconButton } from "@/components/ui/IconButton";
import { normalizeTourUrl } from "@/lib/media/tour-embed";
import {
  OPERATIONS,
  OPERATION_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABELS,
  AMENITIES,
  AMENITY_LABELS,
  CURRENCIES,
  type Amenity,
} from "@/config/filters";
import { MAP_DEFAULTS } from "@/config/site";

const LocationPicker = dynamicImport(() => import("./LocationPicker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-card" />,
});

export type PropertyFormValues = {
  /** Solo se usa/edita cuando el usuario es admin (ve el selector de inmobiliaria). */
  agencyId: string;
  title: string;
  description: string;
  operation: (typeof OPERATIONS)[number];
  type: (typeof PROPERTY_TYPES)[number];
  status: (typeof PROPERTY_STATUSES)[number];
  priceAmount: string;
  currency: (typeof CURRENCIES)[number];
  expenses: string;
  period: "total" | "mensual";
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  province: string;
  showExact: boolean;
  lng: number;
  lat: number;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  garages: string;
  coveredArea: string;
  totalArea: string;
  age: string;
  floor: string;
  orientation: string;
  amenities: Amenity[];
  images: UploadedImage[];
  /** Una propiedad puede tener varios recorridos — distintos ambientes, o un link de Polycam + un .glb de respaldo. */
  tours: TourFormRow[];
};

/** Una fila del formulario de recorridos — `url` sin procesar (ver `normalizeTourUrl`), `label` opcional (ej. "Living"). */
export type TourFormRow = { url: string; label: string };

const MAX_TOUR_ROWS = 6;

export const emptyPropertyForm: PropertyFormValues = {
  agencyId: "",
  title: "",
  description: "",
  operation: "venta",
  type: "departamento",
  status: "draft",
  priceAmount: "",
  currency: "USD",
  expenses: "",
  period: "total",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  province: "",
  showExact: true,
  lng: MAP_DEFAULTS.center[0],
  lat: MAP_DEFAULTS.center[1],
  rooms: "",
  bedrooms: "",
  bathrooms: "",
  garages: "",
  coveredArea: "",
  totalArea: "",
  age: "",
  floor: "",
  orientation: "",
  amenities: [],
  images: [],
  tours: [],
};

function toPayload(v: PropertyFormValues) {
  return {
    // Solo tiene efecto para un admin — el servidor ignora este campo para
    // dueños/agentes de inmobiliaria y siempre fuerza su propio agencyId.
    ...(v.agencyId ? { agencyId: v.agencyId } : {}),
    title: v.title,
    description: v.description,
    operation: v.operation,
    type: v.type,
    status: v.status,
    price: {
      amount: Number(v.priceAmount) || 0,
      currency: v.currency,
      expenses: Number(v.expenses) || 0,
      period: v.period,
    },
    address: {
      street: v.street || undefined,
      number: v.number || undefined,
      neighborhood: v.neighborhood || undefined,
      city: v.city,
      province: v.province || undefined,
      country: "Argentina",
      showExact: v.showExact,
    },
    location: [v.lng, v.lat] as [number, number],
    features: {
      rooms: v.rooms ? Number(v.rooms) : undefined,
      bedrooms: v.bedrooms ? Number(v.bedrooms) : undefined,
      bathrooms: v.bathrooms ? Number(v.bathrooms) : undefined,
      garages: v.garages ? Number(v.garages) : 0,
      coveredArea: v.coveredArea ? Number(v.coveredArea) : undefined,
      totalArea: v.totalArea ? Number(v.totalArea) : undefined,
      age: v.age ? Number(v.age) : undefined,
      floor: v.floor ? Number(v.floor) : undefined,
      orientation: v.orientation || undefined,
    },
    amenities: v.amenities,
    media: {
      images: v.images.map((img) => ({
        url: img.url,
        alt: img.alt || v.title,
        order: img.order,
        providerId: img.providerId,
      })),
      videos: [],
      floorPlans: [],
      tours: buildToursPayload(v),
    },
  };
}

function buildToursPayload(v: PropertyFormValues) {
  return v.tours
    .map((row) => {
      const url = row.url.trim();
      if (!url) return null;

      const detected = normalizeTourUrl(url);
      if (detected.kind === "invalid") return null;

      const label = row.label.trim() || undefined;
      if (detected.kind === "mesh") {
        return {
          label,
          kind: "mesh" as const,
          provider: detected.provider,
          meshUrl: detected.url,
          meshFormat: detected.format,
        };
      }

      return {
        label,
        kind: "iframe" as const,
        provider: detected.provider,
        embedUrl: detected.url,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

export function PropertyForm({
  mode,
  propertyId,
  initialValues,
  agencies,
  initialAgencyId,
}: {
  mode: "create" | "edit";
  propertyId?: string;
  initialValues?: PropertyFormValues;
  /** Presente solo para el admin — muestra el selector de inmobiliaria. */
  agencies?: { id: string; name: string }[];
  /** Preselección al crear (ej: viene de "+ Propiedad" en /admin para una inmobiliaria puntual). */
  initialAgencyId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PropertyFormValues>(() => {
    if (initialValues) return initialValues;
    return { ...emptyPropertyForm, agencyId: initialAgencyId ?? agencies?.[0]?.id ?? "" };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleAmenity(a: Amenity) {
    setValues((v) => ({
      ...v,
      amenities: v.amenities.includes(a) ? v.amenities.filter((x) => x !== a) : [...v.amenities, a],
    }));
  }

  function addTourRow() {
    setValues((v) => ({ ...v, tours: [...v.tours, { url: "", label: "" }] }));
  }

  function updateTourRow(i: number, patch: Partial<TourFormRow>) {
    setValues((v) => ({ ...v, tours: v.tours.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  }

  function removeTourRow(i: number) {
    setValues((v) => ({ ...v, tours: v.tours.filter((_, idx) => idx !== i) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = mode === "create" ? "/api/dashboard/properties" : `/api/dashboard/properties/${propertyId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(values)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "No se pudo guardar la propiedad.");
      router.push("/dashboard/propiedades");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la propiedad.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Información básica</h2>
        {agencies && (
          <SelectField
            label="Inmobiliaria"
            required
            value={values.agencyId}
            onChange={(e) => set("agencyId", e.target.value)}
          >
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        )}
        <FormField label="Título" required value={values.title} onChange={(e) => set("title", e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Descripción</label>
          <textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={5}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Operación" value={values.operation} onChange={(e) => set("operation", e.target.value as PropertyFormValues["operation"])}>
            {OPERATIONS.map((o) => (
              <option key={o} value={o}>
                {OPERATION_LABELS[o]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Tipo" value={values.type} onChange={(e) => set("type", e.target.value as PropertyFormValues["type"])}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Estado" value={values.status} onChange={(e) => set("status", e.target.value as PropertyFormValues["status"])}>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROPERTY_STATUS_LABELS[s]}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="text-xs text-text-muted">
          Sólo las propiedades en estado &quot;Publicada&quot; se ven en el sitio, el mapa y las
          recomendaciones. El resto de los estados quedan guardados pero no son públicos.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Precio</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label="Monto" type="number" min={0} value={values.priceAmount} onChange={(e) => set("priceAmount", e.target.value)} />
          <SelectField label="Moneda" value={values.currency} onChange={(e) => set("currency", e.target.value as PropertyFormValues["currency"])}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <FormField label="Expensas" type="number" min={0} value={values.expenses} onChange={(e) => set("expenses", e.target.value)} />
          <SelectField label="Período" value={values.period} onChange={(e) => set("period", e.target.value as PropertyFormValues["period"])}>
            <option value="total">Total</option>
            <option value="mensual">Mensual</option>
          </SelectField>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Ubicación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Calle" value={values.street} onChange={(e) => set("street", e.target.value)} />
          <FormField label="Número" value={values.number} onChange={(e) => set("number", e.target.value)} />
          <FormField label="Barrio" value={values.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
          <FormField label="Ciudad" required value={values.city} onChange={(e) => set("city", e.target.value)} />
          <FormField label="Provincia" value={values.province} onChange={(e) => set("province", e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={values.showExact} onChange={(e) => set("showExact", e.target.checked)} className="h-4 w-4 accent-accent" />
          Mostrar dirección exacta públicamente
        </label>
        <LocationPicker lng={values.lng} lat={values.lat} onChange={(lng, lat) => setValues((v) => ({ ...v, lng, lat }))} />
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Características</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label="Ambientes" type="number" min={0} value={values.rooms} onChange={(e) => set("rooms", e.target.value)} />
          <FormField label="Dormitorios" type="number" min={0} value={values.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
          <FormField label="Baños" type="number" min={0} value={values.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
          <FormField label="Cocheras" type="number" min={0} value={values.garages} onChange={(e) => set("garages", e.target.value)} />
          <FormField label="Sup. cubierta (m²)" type="number" min={0} value={values.coveredArea} onChange={(e) => set("coveredArea", e.target.value)} />
          <FormField label="Sup. total (m²)" type="number" min={0} value={values.totalArea} onChange={(e) => set("totalArea", e.target.value)} />
          <FormField label="Antigüedad (años)" type="number" min={0} value={values.age} onChange={(e) => set("age", e.target.value)} />
          <FormField label="Piso" type="number" value={values.floor} onChange={(e) => set("floor", e.target.value)} />
        </div>
        <FormField label="Orientación" value={values.orientation} onChange={(e) => set("orientation", e.target.value)} placeholder="Norte, Sur..." />
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Comodidades</h2>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => (
            <FilterPill key={a} type="button" active={values.amenities.includes(a)} onClick={() => toggleAmenity(a)}>
              {AMENITY_LABELS[a]}
            </FilterPill>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Fotos</h2>
        <ImageUploader
          images={values.images}
          onChange={(images) => set("images", images)}
          agencyId={agencies ? values.agencyId : undefined}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Recorridos 3D / Digital Twin</h2>
        <p className="text-sm text-text-muted">
          Escaneá el espacio con Polycam (o Matterport, Kuula, Sketchfab...) y pegá acá el link de esa captura —
          no hace falta subir ningún archivo. Podés cargar más de uno: distintos ambientes escaneados por
          separado, o un link de recorrido + la URL de un .glb de respaldo (ver nota abajo).
        </p>

        {values.tours.map((row, i) => (
          <div key={i} className="flex items-start gap-2 rounded-media border border-border p-4">
            <div className="flex flex-1 flex-col gap-3">
              <FormField
                label={values.tours.length > 1 ? `URL del recorrido ${i + 1}` : "URL del recorrido o del modelo 3D"}
                placeholder="https://poly.cam/capture/... o https://my.matterport.com/show/?m=..."
                value={row.url}
                onChange={(e) => updateTourRow(i, { url: e.target.value })}
              />
              <TourUrlPreview url={row.url} />
              {values.tours.length > 1 && (
                <FormField
                  label="Nombre (opcional)"
                  placeholder="Ej: Living, Fachada..."
                  value={row.label}
                  onChange={(e) => updateTourRow(i, { label: e.target.value })}
                />
              )}
            </div>
            <IconButton
              aria-label="Quitar recorrido"
              onClick={() => removeTourRow(i)}
              className="mt-1"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </IconButton>
          </div>
        ))}

        <Button type="button" variant="secondary" onClick={addTourRow} disabled={values.tours.length >= MAX_TOUR_ROWS}>
          + Agregar recorrido
        </Button>

        <p className="text-xs text-text-muted">
          En Polycam: abrí la captura → Compartir → copiá el link de esa captura (no el de poly.cam solo). Los
          recorridos incrustados (Polycam, Matterport...) a veces no cargan bien dentro de la página según el
          navegador de quien visita — va a poder abrirlos en pantalla completa si eso pasa. Para más seguridad,
          sumá también la URL de un archivo exportado (.glb/.usdz).
        </p>
      </section>

      {error && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/propiedades")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Guardando…"
            : mode === "edit"
              ? "Guardar cambios"
              : values.status === "published"
                ? "Publicar propiedad"
                : "Guardar como borrador"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Chip de confirmación bajo el campo de URL del recorrido — muestra qué se
 * detectó (o el error) antes de guardar, para no descubrir un link roto
 * recién al ver la publicación (ver `normalizeTourUrl`).
 */
function TourUrlPreview({ url }: { url: string }) {
  const detected = useMemo(() => (url.trim() ? normalizeTourUrl(url) : null), [url]);
  if (!detected) return null;

  if (detected.kind === "invalid") {
    return <p className="text-sm text-danger">{detected.reason}</p>;
  }

  // "custom" (proveedor no reconocido) es una advertencia, no una confirmación.
  if (detected.provider === "custom") {
    return <p className="text-sm text-warning">{detected.label}</p>;
  }

  return (
    <p className="flex items-center gap-1.5 text-sm text-success">
      <CheckIcon />
      {detected.label}
    </p>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
