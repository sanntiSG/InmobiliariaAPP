"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Check, ExternalLink, Loader2, Mail, MessageCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { buildWhatsappLink } from "@/config/site";
import type { MailOverview } from "@/lib/mail/overview";
import { mailApi, MailApiError } from "./mail-api";

/** ¿Se puede conectar la casilla desde esta web? Si no, por qué (la plataforma no activó el correo, o es la web de respaldo). */
export function setupState(o: MailOverview): "ready" | "not_ready" | "backup" {
  if (!o.cryptoReady) return "not_ready";
  if (!o.sendEnabled) return "backup";
  return "ready";
}

const WHATSAPP_TEXT = "Hola, quiero activar el agente de correo de mi inmobiliaria en Recorrr.";

/**
 * Lo que ve una inmobiliaria cuando todavía no puede conectar su casilla, ANTES de pedirle datos que después no servirían:
 *  - la plataforma no activó el correo: se explica en una frase y se avisa al administrador con un botón (o por WhatsApp);
 *  - es la web de respaldo (Render, donde no se puede enviar): se la manda a la web principal.
 * Si quien mira es el admin, se le dice dónde se activa en vez de pedirle que se avise a sí mismo.
 */
export function MailSetupNotice({ overview, agencyId }: { overview: MailOverview; agencyId: string | null }) {
  const state = setupState(overview);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "ready") return null;

  const notify = async () => {
    setPhase("sending");
    setError(null);
    try {
      await mailApi("/request-setup", agencyId, { method: "POST" });
      setPhase("sent");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof MailApiError ? e.message : "No se pudo enviar el aviso. Probá de nuevo.");
    }
  };

  if (state === "backup") {
    const main = overview.mainSiteUrl ? `${overview.mainSiteUrl}/dashboard/agentes/correo` : null;
    return (
      <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card" aria-labelledby="mail-backup-title">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
            <Mail className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="mail-backup-title" className="font-display text-base font-bold text-text">
              La casilla se conecta desde la web principal
            </h3>
            <p className="mt-0.5 text-sm text-text-muted">
              Estás en la web de respaldo, que no puede enviar mails. Entrá desde la principal y conectala ahí: después podés mirar y confirmar tus mails desde cualquiera de las dos.
            </p>
          </div>
        </div>
        {main && (
          <a href={main} rel="noopener noreferrer" className={buttonClasses("primary", "md", "w-fit")}>
            Ir a la web principal <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card" aria-labelledby="mail-setup-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 id="mail-setup-title" className="font-display text-base font-bold text-text">
            El correo todavía no está activado en la plataforma
          </h3>
          <p className="mt-0.5 text-sm text-text-muted">
            {overview.viewerIsAdmin
              ? "Falta un paso, que se hace una sola vez para todas las inmobiliarias. Te lo explico en tres minutos."
              : overview.canManage
                ? "Quien administra la plataforma lo tiene que activar una sola vez, y después cada inmobiliaria conecta su casilla sola. No tenés que hacer nada técnico: avisale y listo."
                : "Todavía no se puede usar. Cuando el dueño de la inmobiliaria lo pida y la plataforma lo active, vas a ver los mails de tu casilla acá."}
          </p>
        </div>
      </div>

      {overview.viewerIsAdmin ? (
        <Link href="/admin/agentes/mail" className={buttonClasses("primary", "md", "w-fit")}>
          Activar el correo <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : !overview.canManage ? null : phase === "sent" ? (
        <p role="status" className="flex items-start gap-3 rounded-media bg-success-soft p-4 text-sm text-text">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <span>
            <strong className="font-semibold">Listo, ya le avisamos al administrador.</strong> Cuando lo active, vas a poder conectar tu casilla desde esta misma pantalla.
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={() => void notify()} disabled={phase === "sending"}>
            {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
            Avisar al administrador
          </Button>
          <a href={buildWhatsappLink(WHATSAPP_TEXT)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
            <MessageCircle className="h-4 w-4" aria-hidden /> Escribir por WhatsApp
          </a>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
