"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { MailActivationStatus } from "@/lib/mail/activation";


const VAR_NAME = "MAIL_CREDENTIALS_KEY";
/** Si la revisión (cada 5 minutos) no corrió en este tiempo, algo anda mal. */
const STALE_AFTER_MIN = 15;

function agoText(min: number): string {
  if (min < 1) return "hace menos de un minuto";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / (60 * 24))} días`;
}

/** Una clave de 32 bytes al azar, creada en ESTE navegador: nunca viaja al servidor. */
function makeKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

type Tone = "ok" | "warn" | "off";
const DOT: Record<Tone, string> = { ok: "bg-success", warn: "bg-warning", off: "bg-border-hi" };

function StatusRow({ tone, label, children }: { tone: Tone; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <span className="min-w-0 text-sm">
        <span className="block font-medium text-text">{label}</span>
        <span className="block text-text-muted">{children}</span>
      </span>
    </li>
  );
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      // Sin permiso para el portapapeles: la persona puede seleccionar el texto a mano.
    }
  };
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} className={className} aria-live="polite">
      {done ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {done ? "Copiado" : label}
    </Button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent" aria-hidden>
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h3 className="text-[15px] font-semibold text-text">{title}</h3>
        {children}
      </div>
    </li>
  );
}

/**
 * Activación del agente de correo, pensada para quien NO es técnico: un solo paso que se hace una vez para toda la plataforma
 * (crear una clave y pegarla en Netlify), con estado en vivo para saber si ya funciona. La clave se crea en el navegador y
 * nunca se guarda ni se manda al servidor: este panel sólo explica y muestra el estado.
 */
export function MailActivation({ status }: { status: MailActivationStatus }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const backup = status.platform === "backup";
  // Un latido viejo no cuenta si la clave se quitó: sin clave la revisión no corre.
  const running = status.keyReady && status.lastRunAgoMin !== null && status.lastRunAgoMin <= STALE_AFTER_MIN;
  const allGood = status.keyReady && !backup && running && status.agentOn;

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  };

  const heading = backup ? "Esta es la web de respaldo" : allGood ? "El correo está activado" : status.keyReady ? "Casi listo" : "Falta un paso para activar el correo";

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card sm:p-6" aria-labelledby="mail-activation">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="mail-activation" className="font-display text-lg font-semibold text-text">
            {heading}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            {backup
              ? "El correo se activa y se maneja desde la web principal. Desde acá se puede ver el estado y confirmar mails, pero no conectar casillas ni enviar."
              : allGood
                ? "Se hace una sola vez para toda la plataforma. Cada inmobiliaria conecta su casilla sola, desde su panel."
                : "Es un paso que se hace una sola vez para toda la plataforma, no uno por cada casilla. Después, cada inmobiliaria conecta la suya sola desde su panel."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden /> Actualizar estado
        </Button>
      </header>

      <ul className="grid divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0" aria-label="Estado del correo">
        <StatusRow tone={status.keyReady ? "ok" : "warn"} label="Clave de seguridad">
          {status.keyReady ? "Cargada. Con ella se cifran las contraseñas de las casillas." : "Todavía no está cargada en Netlify."}
        </StatusRow>
        <StatusRow tone={backup ? "off" : running ? "ok" : status.keyReady ? "warn" : "off"} label="Revisión automática (cada 5 minutos)">
          {backup
            ? "La hace la web principal."
            : !status.keyReady
              ? "Se enciende sola cuando cargues la clave."
              : status.lastRunAgoMin === null
                ? "Todavía no corrió. Debería empezar a los 5 minutos de publicar con la clave."
                : running
                  ? `Última revisión ${agoText(status.lastRunAgoMin)}.`
                  : `No corre desde ${agoText(status.lastRunAgoMin)}. En Netlify, mirá Logs → Functions → mail-poll.`}
        </StatusRow>
        <StatusRow tone={status.sender ? "ok" : "off"} label="Envío de respuestas">
          {status.sender ? "Esta web puede enviar mails." : backup ? "Desde el respaldo no se envía: lo hace la web principal." : "Se activa solo con la clave."}
        </StatusRow>
        <StatusRow tone={status.troubled > 0 ? "warn" : status.connected > 0 ? "ok" : "off"} label="Casillas conectadas">
          {status.connected} de {status.agencies} {status.agencies === 1 ? "inmobiliaria" : "inmobiliarias"}
          {status.troubled > 0 ? ` · ${status.troubled} con problemas` : ""}.
        </StatusRow>
      </ul>

      {backup ? (
        status.mainSiteUrl && (
          <a href={`${status.mainSiteUrl}/admin/agentes/mail`} rel="noopener noreferrer" className={buttonClasses("primary", "md", "w-fit")}>
            Ir a la web principal <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )
      ) : (
        <details className="group rounded-media border border-border" open={!allGood}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
            {allGood ? "Ver los pasos de activación otra vez" : "Cómo activarlo, paso a paso"}
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="flex flex-col gap-6 px-4 pb-5 pt-2">
            <Step n={1} title={status.keyReady ? "La clave de seguridad" : "Generá la clave de seguridad"}>
              {status.keyReady ? (
                <p className="text-sm text-text-muted">
                  Ya está cargada. <strong className="font-semibold text-text">No la cambies</strong> si hay casillas conectadas: cada una tendría que volver a conectarse. Si de todos modos necesitás cambiarla, mirá “Opciones avanzadas”.
                </p>
              ) : (
                <>
                  <p className="text-sm text-text-muted">Es una contraseña larga que la web usa para guardar cifradas las contraseñas de las casillas. La creás acá, en tu navegador; nunca se guarda en este sitio.</p>
                  {key ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-2 rounded-media bg-surface-2 p-3.5 sm:flex-row sm:items-center">
                        <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px] leading-relaxed text-text">{key}</code>
                        <CopyButton text={key} label="Copiar clave" className="shrink-0 self-start sm:self-center" />
                      </div>
                      <p className="flex items-start gap-2 text-sm text-text">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                        <span>
                          <strong className="font-semibold">Guardala ahora en tu gestor de contraseñas.</strong> Este panel no la vuelve a mostrar y, si se pierde, cada inmobiliaria tiene que volver a conectar su casilla.
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Button type="button" onClick={() => setKey(makeKey())}>
                        <KeyRound className="h-4 w-4" aria-hidden /> Generar la clave
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Step>

            {!status.keyReady && (
              <Step n={2} title="Pegala en Netlify">
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text-muted marker:text-text-muted">
                  <li>
                    Entrá a tu sitio en Netlify y abrí <strong className="font-semibold text-text">Site configuration → Environment variables</strong>.
                  </li>
                  <li>
                    Tocá <strong className="font-semibold text-text">Add a variable</strong> y elegí “Add a single variable”.
                  </li>
                  <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    En <em>Key</em> escribí{" "}
                    <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-text">{VAR_NAME}</code>
                    <CopyButton text={VAR_NAME} label="Copiar nombre" />
                  </li>
                  <li>
                    En <em>Values</em> pegá la clave del paso 1 (dejá las opciones tal como vienen) y tocá <strong className="font-semibold text-text">Create variable</strong>.
                  </li>
                  <li>
                    Andá a <strong className="font-semibold text-text">Deploys → Trigger deploy → Deploy site</strong> y esperá a que termine (1 o 2 minutos).
                  </li>
                </ol>
                <div>
                  <a href="https://app.netlify.com" target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
                    Abrir Netlify <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                </div>
              </Step>
            )}

            {!status.keyReady && (
              <Step n={3} title="Volvé acá y actualizá el estado">
                <p className="text-sm text-text-muted">Cuando el deploy termine, tocá “Actualizar estado”: la clave tiene que figurar como cargada. No hace falta tocar GitHub ni Render.</p>
              </Step>
            )}

            <Step n={status.keyReady ? 2 : 4} title="Encendé el agente para las inmobiliarias">
              <p className="text-sm text-text-muted">
                Más abajo, en <strong className="font-semibold text-text">Disponible para</strong>, marcá “Inmobiliarias y admin” y tocá <strong className="font-semibold text-text">Publicar</strong>.{" "}
                {status.agentOn ? "Ya está encendido." : "Todavía está apagado."}
              </p>
              <div>
                <a href="#studio-identity" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
                  Ir a esa sección
                </a>
              </div>
            </Step>
          </ol>
        </details>
      )}

      <details className="group rounded-media border border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          Opciones avanzadas (casi nunca hacen falta)
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="flex flex-col gap-3 px-4 pb-4 pt-1 text-sm">
          {[
            ["PUBLIC_SITE_URL", "Dirección que usan los enlaces dentro de los mails. Si no la cargás, se usa la de tu sitio (AUTH_URL)."],
            ["MAIL_SITE_HOSTS", "Otros dominios tuyos, separados por coma, para reconocer enlaces a tus fichas dentro de un mail."],
            ["MAIL_CREDENTIALS_KEY_PREVIOUS", "Para cambiar la clave sin desconectar a nadie: pasá la clave vieja acá y cargá la nueva en MAIL_CREDENTIALS_KEY."],
            ["MAIL_POLLER_ENABLED y MAIL_SEND_ENABLED", "Con el valor false apagan la revisión o el envío. Normalmente no se cargan."],
            ["CRON_SECRET", "Sólo si querés usar un programador externo en lugar del de Netlify."],
          ].map(([name, text]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <dt>
                <code className="font-mono text-[13px] text-text">{name}</code>
              </dt>
              <dd className="text-text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </details>

      <Link href="/dashboard/agentes/correo" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accent hover:underline">
        Ver el estado de cada casilla
      </Link>
    </section>
  );
}
