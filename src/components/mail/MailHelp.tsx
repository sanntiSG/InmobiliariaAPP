"use client";

import { useState } from "react";
import { BellRing, Check, ChevronDown, Loader2, MessageCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { buildWhatsappLink } from "@/config/site";
import { mailApi, MailApiError } from "./mail-api";

/**
 * "¿Te trabaste? Pedí ayuda": si la inmobiliaria no puede (o prefiere no) crear la contraseña de aplicación sola, acá ve QUÉ
 * mandarle al administrador (su nombre, el email de la casilla y la contraseña con el nombre que la identifica), puede avisarle
 * desde la plataforma y abrir un WhatsApp con el mensaje armado. El administrador conecta la casilla "viendo como" ella.
 */
export function MailHelp({ agencyId, agencyName, appName, email }: { agencyId: string | null; agencyName: string; appName: string; email: string }) {
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const notify = async () => {
    setPhase("sending");
    setError(null);
    try {
      await mailApi("/request-help", agencyId, { method: "POST", body: JSON.stringify(validEmail ? { email: email.trim() } : {}) });
      setPhase("sent");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof MailApiError ? e.message : "No se pudo enviar el aviso. Probá de nuevo.");
    }
  };

  const message = `Hola, soy de «${agencyName}». Quiero conectar mi correo de consultas al agente de correo de Recorrr y necesito ayuda.${validEmail ? ` El email es ${email.trim()}.` : ""} Te paso por acá la contraseña de aplicación «${appName}»:`;

  return (
    <details className="group rounded-media border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
        ¿Te trabaste? Pedí ayuda al administrador
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm text-text-muted">
        <p>El administrador puede conectar la casilla por vos. Mandale estos tres datos por WhatsApp:</p>
        <ol className="list-decimal pl-5 marker:font-semibold">
          <li>
            El nombre de tu inmobiliaria: <strong className="font-semibold text-text [overflow-wrap:anywhere]">{agencyName}</strong>.
          </li>
          <li>El email de la casilla donde recibís las consultas de tus clientes.</li>
          <li>
            La contraseña de aplicación (las 16 letras que te da tu correo), creada con el nombre <strong className="font-semibold text-text [overflow-wrap:anywhere]">{appName}</strong>: así sabemos de quién es.
          </li>
        </ol>
        <p className="text-xs">La contraseña de aplicación sirve sólo para esta aplicación: no es la de tu cuenta y la podés borrar cuando quieras desde la configuración de tu correo.</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href={buildWhatsappLink(message)} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md")}>
            <MessageCircle className="h-4 w-4" aria-hidden /> Escribir por WhatsApp
          </a>
          <Button type="button" variant="secondary" onClick={() => void notify()} disabled={phase !== "idle"}>
            {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : phase === "sent" ? <Check className="h-4 w-4 text-success" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
            {phase === "sent" ? "Ya le avisamos" : "Avisar al administrador"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
