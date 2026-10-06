"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { AgencyImageField } from "./AgencyImageField";
import { agencyProfileSchema } from "@/lib/validation/agency";

export type AgencyProfileValues = {
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  province: string;
  logo: string;
  cover: string;
};

/**
 * Edición del perfil público de la inmobiliaria (lo que se ve en
 * /inmobiliarias/[slug]). La edita su propio equipo; el admin puede editar
 * cualquiera pasando `agencyId`.
 */
export function AgencyProfileForm({
  initialValues,
  agencyId,
}: {
  initialValues: AgencyProfileValues;
  /** Sólo el admin lo pasa: qué inmobiliaria está editando. */
  agencyId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof AgencyProfileValues>(key: K, value: AgencyProfileValues[K]) {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);

    const payload = { ...values, ...(agencyId ? { agencyId } : {}) };
    const parsed = agencyProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/dashboard/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar el perfil.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <section className="flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Imagen</h2>
        <AgencyImageField
          label="Logo"
          hint="Cuadrado, JPG o PNG. Se muestra en tu perfil y en cada publicación."
          kind="logo"
          shape="square"
          value={values.logo}
          onChange={(url) => set("logo", url)}
          agencyId={agencyId}
        />
        <AgencyImageField
          label="Portada"
          hint="Horizontal, mejor si es de 1600×500 o más. Va arriba de tu perfil."
          kind="cover"
          value={values.cover}
          onChange={(url) => set("cover", url)}
          agencyId={agencyId}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Presentación</h2>
        <FormField label="Nombre" required value={values.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="agency-description" className="text-sm font-medium text-text">
            Descripción
          </label>
          <textarea
            id="agency-description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Contá en pocas líneas quiénes son y en qué zonas trabajan."
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {errors.description && <p className="text-sm text-danger">{errors.description}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Ciudad" required value={values.city} onChange={(e) => set("city", e.target.value)} error={errors.city} />
          <FormField label="Provincia" value={values.province} onChange={(e) => set("province", e.target.value)} error={errors.province} />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="WhatsApp"
            required
            placeholder="5491137796683"
            value={values.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            error={errors.whatsapp}
          />
          <FormField label="Teléfono" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
          <FormField label="Email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
          <FormField
            label="Sitio web"
            type="url"
            placeholder="https://"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
            error={errors.website}
          />
        </div>
      </section>

      {formError && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm font-medium text-success" role="status">
            Cambios guardados
          </span>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
