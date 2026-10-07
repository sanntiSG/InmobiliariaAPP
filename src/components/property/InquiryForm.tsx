"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Button, buttonClasses } from "@/components/ui/Button";
import { inquirySchema } from "@/lib/validation/lead";
import { useWhatsappLauncher } from "@/lib/whatsapp/useWhatsappLauncher";

type Values = { name: string; email: string; phone: string; message: string; website: string };

/**
 * Formulario de consulta de la ficha. Genera un cliente potencial (lead) en el
 * panel de la inmobiliaria y, al terminar, abre WhatsApp con la inmobiliaria con
 * un mensaje detallado ya armado (propiedad, link y los datos que la persona
 * completó). Es la tarjeta "completa"; el botón de contacto de arriba manda un
 * mensaje corto.
 */
export function InquiryForm({
  propertyId,
  propertyTitle,
  defaultName = "",
  defaultEmail = "",
}: {
  propertyId: string;
  propertyTitle: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [values, setValues] = useState<Values>({
    name: defaultName,
    email: defaultEmail,
    phone: "",
    message: `Hola! Me interesa «${propertyTitle}». ¿Sigue disponible?`,
    website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ whatsappHref: string | null; opened: boolean } | null>(null);
  const whatsapp = useWhatsappLauncher();

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = inquirySchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSending(true);
    // Se reserva la pestaña de WhatsApp dentro del clic (si se abriera recién tras guardar, el navegador la bloquea).
    whatsapp.reserve();
    try {
      const res = await fetch(`/api/properties/${propertyId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar la consulta.");
      const whatsappHref: string | null = data?.whatsappHref ?? null;
      if (whatsappHref) setDone({ whatsappHref, opened: whatsapp.launch(whatsappHref) });
      else {
        whatsapp.cancel();
        setDone({ whatsappHref: null, opened: false });
      }
    } catch (err) {
      whatsapp.cancel();
      setFormError(err instanceof Error ? err.message : "No se pudo enviar la consulta.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-3 p-5 text-center" role="status">
        <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
        <div>
          <p className="font-display text-lg font-bold text-text">¡Consulta enviada!</p>
          <p className="mt-1 text-sm text-text-muted">
            {done.whatsappHref
              ? done.opened
                ? "Te abrimos WhatsApp con tu consulta ya escrita: enviála para hablar directo con la inmobiliaria."
                : "Tocá el botón para abrir WhatsApp con tu consulta ya escrita y enviála para hablar directo con la inmobiliaria."
              : "La inmobiliaria te va a responder a la brevedad."}
          </p>
        </div>
        {done.whatsappHref && (
          <a
            href={done.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses(done.opened ? "secondary" : "primary", "md", "inline-flex w-full items-center gap-2")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {done.opened ? "Abrir WhatsApp de nuevo" : "Abrir WhatsApp"}
          </a>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-bold text-text">Consultar por esta propiedad</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3" noValidate>
        <FormField label="Nombre" autoComplete="name" value={values.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <FormField label="Email" type="email" autoComplete="email" value={values.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
        <FormField label="Teléfono" type="tel" autoComplete="tel" placeholder="Opcional si dejaste email" value={values.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-message" className="text-sm font-medium text-text">
            Mensaje
          </label>
          <textarea
            id="inquiry-message"
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {errors.message && <p className="text-sm text-danger">{errors.message}</p>}
        </div>

        {/* Honeypot: oculto para personas; los bots suelen completarlo. */}
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
          <label>
            No completar
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </div>

        {formError && (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={sending}>
          {sending ? "Enviando…" : "Enviar consulta"}
        </Button>
      </form>
    </Card>
  );
}
