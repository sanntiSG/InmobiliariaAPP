"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Step, agencyFromLocation } from "@/components/agents/step-kit";
import { useAdvisorState } from "@/components/advisor/store";
import { MailDesk } from "@/components/mail/MailDesk";
import { buttonClasses } from "@/components/ui/Button";
import type { MailOverview } from "@/lib/mail/overview";

/** Lo que el agente cuenta al abrirse, según cómo esté la casilla. */
function speechFor(o: MailOverview | null): string {
  if (!o) return "Estoy mirando tu correo…";
  if (!o.mailbox) return "Hola, soy tu agente de correo. Todavía no conectaste tu casilla: conectala y yo me ocupo de leer las consultas y dejarte las respuestas listas.";
  if (o.mailbox.status !== "active") return "Tengo un problema para entrar a tu casilla. Mirá el aviso de abajo para resolverlo.";
  const n = o.counts.awaiting;
  if (n > 0) return `Tenés ${n} ${n === 1 ? "respuesta" : "respuestas"} para confirmar. Abrí cada una, revisala y mandala.`;
  if (o.counts.failed > 0) return "Hay una respuesta que no se pudo enviar. Abrila en la pestaña Enviados para reintentar.";
  return "Todo al día: no hay respuestas esperando. Si llega una consulta nueva, te aviso.";
}

/**
 * El escenario del agente de correo: la mascota cuenta cómo está la casilla y debajo está el escritorio (los mails para
 * confirmar, los enviados y los ignorados). La conexión y la configuración se hacen en la pantalla completa del correo.
 */
export default function MailStage() {
  const s = useAdvisorState();
  const isAdmin = s.account.role === "admin";
  const [agencyId] = useState<string | null>(isAdmin ? (agencyFromLocation() ?? s.agencyId) : null);
  const thread = useRef<HTMLDivElement>(null);
  const [overview, setOverview] = useState<MailOverview | null>(null);

  const full = `/dashboard/agentes/correo${agencyId ? `?agencyId=${agencyId}` : ""}`;

  if (isAdmin && !agencyId) {
    return (
      <Step
        thread={thread}
        speech="Hola, soy tu agente de correo. Para abrir los mails de una inmobiliaria entrá viendo como esa inmobiliaria; así queda anotado en su bitácora."
        dock={
          <Link href="/dashboard/agentes/correo" className={buttonClasses("primary", "md", "inline-flex w-fit items-center gap-1.5")}>
            Ver el estado de todos los buzones <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />
    );
  }

  return (
    <Step
      thread={thread}
      speech={speechFor(overview)}
      dock={
        <Link href={full} className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent">
          Abrir en pantalla completa
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      }
    >
      <div data-step>
        <MailDesk agencyId={agencyId} layer="overlay" connectHref={full} onOverview={setOverview} />
      </div>
    </Step>
  );
}
