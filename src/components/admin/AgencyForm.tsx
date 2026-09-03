"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { AGENCY_STATUSES, AGENCY_STATUS_LABELS } from "@/lib/validation/agency";

export type AgencyFormValues = {
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  email: string;
  city: string;
  province: string;
  status: (typeof AGENCY_STATUSES)[number];
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

export const emptyAgencyForm: AgencyFormValues = {
  name: "",
  description: "",
  whatsapp: "",
  phone: "",
  email: "",
  city: "",
  province: "",
  status: "active",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
};

export function AgencyForm({
  mode,
  agencyId,
  initialValues,
}: {
  mode: "create" | "edit";
  agencyId?: string;
  initialValues?: AgencyFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AgencyFormValues>(initialValues ?? emptyAgencyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AgencyFormValues>(key: K, value: AgencyFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = mode === "create" ? "/api/admin/agencies" : `/api/admin/agencies/${agencyId}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const payload =
      mode === "create"
        ? values
        : {
            name: values.name,
            description: values.description,
            whatsapp: values.whatsapp,
            phone: values.phone,
            email: values.email,
            city: values.city,
            province: values.province,
            status: values.status,
          };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "No se pudo guardar.");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-text">Datos de la inmobiliaria</h2>
        <FormField label="Nombre" required value={values.name} onChange={(e) => set("name", e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Descripción</label>
          <textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="WhatsApp"
            required
            placeholder="5491137796683"
            value={values.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
          />
          <FormField label="Teléfono" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          <FormField label="Email de contacto" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
          <SelectField label="Estado" value={values.status} onChange={(e) => set("status", e.target.value as AgencyFormValues["status"])}>
            {AGENCY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {AGENCY_STATUS_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <FormField label="Ciudad" required value={values.city} onChange={(e) => set("city", e.target.value)} />
          <FormField label="Provincia" value={values.province} onChange={(e) => set("province", e.target.value)} />
        </div>
      </section>

      {mode === "create" && (
        <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
          <h2 className="font-display text-lg font-semibold text-text">Cuenta del dueño</h2>
          <p className="text-sm text-text-muted">
            Se crea automáticamente con rol de dueño de esta inmobiliaria, con acceso a su dashboard.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nombre" required value={values.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
            <FormField
              label="Email"
              type="email"
              required
              value={values.ownerEmail}
              onChange={(e) => set("ownerEmail", e.target.value)}
            />
          </div>
          <FormField
            label="Contraseña provisoria"
            type="text"
            required
            value={values.ownerPassword}
            onChange={(e) => set("ownerPassword", e.target.value)}
          />
        </section>
      )}

      {error && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push("/admin")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : mode === "create" ? "Crear inmobiliaria" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
