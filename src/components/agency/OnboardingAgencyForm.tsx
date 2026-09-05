"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";

type Values = {
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  email: string;
  city: string;
  province: string;
};

const emptyValues: Values = {
  name: "",
  description: "",
  whatsapp: "",
  phone: "",
  email: "",
  city: "",
  province: "",
};

export function OnboardingAgencyForm() {
  const router = useRouter();
  const { update } = useSession();
  const [values, setValues] = useState<Values>(emptyValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/agency/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "No se pudo crear la inmobiliaria.");

      // Fuerza al JWT a releer el rol/agencyId desde la DB ahora mismo — si
      // no, el guard del dashboard sigue viendo la sesión vieja hasta el
      // próximo refresco automático (cada 5 min, ver src/auth.ts).
      await update();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la inmobiliaria.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <FormField label="Nombre de la inmobiliaria" required value={values.name} onChange={(e) => set("name", e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Descripción</label>
          <textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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
          <FormField label="Ciudad" required value={values.city} onChange={(e) => set("city", e.target.value)} />
          <FormField label="Provincia" value={values.province} onChange={(e) => set("province", e.target.value)} />
        </div>
      </section>

      {error && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Creando…" : "Crear mi inmobiliaria"}
        </Button>
      </div>
    </form>
  );
}
