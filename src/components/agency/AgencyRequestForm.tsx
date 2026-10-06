"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Button, buttonClasses } from "@/components/ui/Button";
import { agencyRequestSchema } from "@/lib/validation/agency-request";
import { buildWhatsappLink } from "@/config/site";
import { brand } from "@/config/brand";

type Values = { agencyName: string; phone: string; zone: string; message: string; website: string };

const emptyValues: Values = { agencyName: "", phone: "", zone: "", message: "", website: "" };

export function requestWhatsappHref(userName: string, agencyName: string, zone?: string) {
  return buildWhatsappLink(
    `Hola! Soy ${userName} y pedí acceso para gestionar "${agencyName}"${zone ? ` (${zone})` : ""} en ${brand.name}.`
  );
}

/**
 * Solicitud para gestionar una inmobiliaria. Se guarda en la plataforma (el
 * admin la ve en /admin/solicitudes y recibe una notificación) y, además, se
 * ofrece el contacto por WhatsApp: el admin valida hablando con la persona
 * antes de aprobar.
 */
export function AgencyRequestForm({ userName, resubmit = false }: { userName: string; resubmit?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<{ agencyName: string; zone: string } | null>(null);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = agencyRequestSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/agency-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar la solicitud.");
      setSent({ agencyName: parsed.data.agencyName, zone: parsed.data.zone });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-7 text-center shadow-card" role="status">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
        <div>
          <h2 className="font-display text-xl font-bold text-text">¡Solicitud enviada!</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            El equipo de {brand.name} la va a revisar. Escribinos por WhatsApp para conversarlo y validar los
            datos — cuando la aprobemos te avisamos acá, dentro de la plataforma.
          </p>
        </div>
        <a
          href={requestWhatsappHref(userName, sent.agencyName, sent.zone)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("primary", "md")}
        >
          Hablar por WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <FormField
          label="Nombre de la inmobiliaria"
          required
          value={values.agencyName}
          onChange={(e) => set("agencyName", e.target.value)}
          error={errors.agencyName}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Teléfono o WhatsApp"
            type="tel"
            autoComplete="tel"
            required
            placeholder="+54 9 11 …"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={errors.phone}
          />
          <FormField
            label="Zona en la que trabajás"
            required
            placeholder="Ej: Zona Sur, GBA"
            value={values.zone}
            onChange={(e) => set("zone", e.target.value)}
            error={errors.zone}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="request-message" className="text-sm font-medium text-text">
            Mensaje <span className="font-normal text-text-muted">(opcional)</span>
          </label>
          <textarea
            id="request-message"
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {errors.message && <p className="text-sm text-danger">{errors.message}</p>}
        </div>

        {/* Honeypot: oculto para personas; los bots suelen completarlo. */}
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
          <label>
            No completar
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </label>
        </div>
      </section>

      {formError && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {formError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Enviando…" : resubmit ? "Enviar una nueva solicitud" : "Enviar solicitud"}
        </Button>
      </div>
    </form>
  );
}
