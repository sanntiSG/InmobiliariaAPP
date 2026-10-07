"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Button, buttonClasses } from "@/components/ui/Button";
import { agencyRequestSchema } from "@/lib/validation/agency-request";
import { providerRequestMessage, whatsappUrl } from "@/lib/whatsapp/messages";
import { useWhatsappLauncher } from "@/lib/whatsapp/useWhatsappLauncher";
import { brand } from "@/config/brand";

type Values = { agencyName: string; phone: string; zone: string; message: string; website: string };

const emptyValues: Values = { agencyName: "", phone: "", zone: "", message: "", website: "" };

/**
 * Solicitud para gestionar una inmobiliaria. Se guarda en la plataforma (el
 * admin la ve en /admin/solicitudes y recibe una notificación) y, al terminar,
 * se abre WhatsApp con el proveedor con un mensaje ya armado con los datos del
 * formulario: la persona decide si lo envía (conviene, así el equipo lo ve y
 * le da el permiso).
 */
export function AgencyRequestForm({
  userName,
  email,
  resubmit = false,
}: {
  userName: string;
  email?: string;
  resubmit?: boolean;
}) {
  const [values, setValues] = useState<Values>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<{ whatsappUrl: string; opened: boolean } | null>(null);
  const whatsapp = useWhatsappLauncher();
  const { update } = useSession();

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
    // Se reserva la pestaña de WhatsApp acá, dentro del clic: si se esperara al
    // guardado para abrirla, el navegador la bloquearía como popup.
    whatsapp.reserve();

    try {
      const res = await fetch("/api/agency-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar la solicitud.");
      // Activa el seguimiento rápido de la sesión: apenas el admin apruebe, el menú y los accesos se actualizan.
      void update().catch(() => {});

      const url = whatsappUrl(
        providerRequestMessage({
          userName,
          email,
          agencyName: parsed.data.agencyName,
          zone: parsed.data.zone,
          phone: parsed.data.phone,
          message: parsed.data.message,
        })
      );
      setSent({ whatsappUrl: url, opened: whatsapp.launch(url) });
    } catch (err) {
      whatsapp.cancel();
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
            {sent.opened
              ? "Te abrimos WhatsApp con tus datos ya escritos: enviá el mensaje para que el equipo lo vea y te dé el permiso."
              : "Tocá el botón para abrir WhatsApp con tus datos ya escritos y enviá el mensaje: así el equipo lo ve y te da el permiso."}
          </p>
          <p className="mt-1.5 text-sm text-text-muted">
            Cuando la aprobemos te avisamos acá, dentro de {brand.name}.
          </p>
        </div>
        <a
          href={sent.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses(sent.opened ? "secondary" : "primary", "md", "inline-flex items-center gap-2")}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {sent.opened ? "Abrir WhatsApp de nuevo" : "Abrir WhatsApp"}
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
        <p className="-mt-2 text-xs text-text-muted">
          Lo podés cambiar cuando quieras desde &quot;Mi inmobiliaria&quot;.
        </p>
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

      <div className="flex flex-col items-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Enviando…" : resubmit ? "Enviar una nueva solicitud" : "Enviar solicitud"}
        </Button>
        <p className="text-xs text-text-muted">Al enviar se abre WhatsApp con tus datos para que el equipo te dé el permiso.</p>
      </div>
    </form>
  );
}
