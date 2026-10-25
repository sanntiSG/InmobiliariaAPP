"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Step, agencyFromLocation } from "@/components/agents/step-kit";
import { useAdvisorState } from "@/components/advisor/store";
import { MailDesk } from "@/components/mail/MailDesk";
import { Button, buttonClasses } from "@/components/ui/Button";
import type { MailOverview } from "@/lib/mail/overview";

/** La última inmobiliaria elegida por el admin (al reabrir sigue en la misma). */
let lastAgencyId: string | null = null;

/** Lo que el agente cuenta al abrirse, según cómo esté la casilla. */
function speechFor(o: MailOverview | null, asAdmin: boolean): string {
  if (!o) return "Estoy mirando el correo…";
  if (!o.mailbox) {
    return asAdmin
      ? "Esta inmobiliaria todavía no conectó su casilla. La podés conectar vos por ella, o probar cómo respondería sin conectar nada."
      : "Hola, soy tu agente de correo. Todavía no conectaste tu casilla: conectala y yo me ocupo de leer las consultas y dejarte las respuestas listas. Si querés, probá antes cómo respondería.";
  }
  if (o.mailbox.status !== "active") return "Tengo un problema para entrar a la casilla. Mirá el aviso de abajo para resolverlo.";
  const n = o.counts.awaiting;
  if (n > 0) return `Hay ${n} ${n === 1 ? "respuesta" : "respuestas"} para confirmar. Abrí cada una, revisala y mandala.`;
  if (o.counts.failed > 0) return "Hay una respuesta que no se pudo enviar. Abrila en la pestaña Enviados para reintentar.";
  return "Todo al día: no hay respuestas esperando. Si llega una consulta nueva, te aviso.";
}

/** El admin elige con qué inmobiliaria quiere ver o conectar el correo (el correo es de cada inmobiliaria, no del admin). */
function AgencyStep({ onPick }: { onPick: (id: string) => void }) {
  const thread = useRef<HTMLDivElement>(null);
  const [agencies, setAgencies] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/dashboard/social/agencies", { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: { id: string; name: string }[] }) => setAgencies(d.items))
      .catch(() => !ctrl.signal.aborted && setFailed(true));
    return () => ctrl.abort();
  }, []);

  return (
    <Step
      thread={thread}
      speech="Hola, soy tu agente de correo. El correo es de cada inmobiliaria: elegí con cuál querés ver o conectar la casilla (entrás “viendo como” ella)."
      dock={
        <div className="flex flex-wrap items-center gap-2.5">
          <Button disabled={!choice} onClick={() => onPick(choice)}>
            Continuar <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <Link href="/dashboard/agentes/correo" className={buttonClasses("ghost", "md", "inline-flex items-center gap-1.5")}>
            Ver todas
          </Link>
        </div>
      }
    >
      <div data-step className="max-w-md">
        {failed ? (
          <p className="text-sm text-danger" role="alert">
            No pude cargar la lista de inmobiliarias. Cerrá y volvé a abrirme.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Inmobiliaria
            <select
              value={choice}
              disabled={!agencies}
              onChange={(e) => setChoice(e.target.value)}
              className="h-11 rounded-media border border-border bg-surface px-3.5 text-[15px] text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">{agencies ? "Elegí una…" : "Cargando…"}</option>
              {agencies?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Step>
  );
}

/**
 * El escenario del agente de correo: la mascota cuenta cómo está la casilla y debajo está el escritorio (los mails para
 * confirmar, los enviados y los ignorados, y la prueba "cómo respondería"). La conexión y la configuración se hacen en la
 * pantalla completa del correo.
 */
export default function MailStage() {
  const s = useAdvisorState();
  const isAdmin = s.account.role === "admin";
  const [agencyId, setAgencyId] = useState<string | null>(isAdmin ? (agencyFromLocation() ?? s.agencyId ?? lastAgencyId) : null);
  const thread = useRef<HTMLDivElement>(null);
  const [overview, setOverview] = useState<MailOverview | null>(null);

  if (isAdmin && !agencyId) {
    return (
      <AgencyStep
        onPick={(id) => {
          lastAgencyId = id;
          setAgencyId(id);
        }}
      />
    );
  }

  const full = `/dashboard/agentes/correo${agencyId ? `?agencyId=${agencyId}` : ""}`;

  return (
    <Step
      thread={thread}
      speech={speechFor(overview, isAdmin)}
      dock={
        <Link href={full} className="group inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-accent">
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
