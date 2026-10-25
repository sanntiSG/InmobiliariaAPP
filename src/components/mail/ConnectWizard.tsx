"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { PRESETS, providerFromEmail, type MailProviderId } from "@/lib/mail/presets";
import type { MailOverview } from "@/lib/mail/overview";
import { mailApi, MailApiError } from "./mail-api";

type Step = "provider" | "guide" | "credentials" | "testing" | "done";

const PROVIDERS: { id: MailProviderId; label: string; hint: string }[] = [
  { id: "gmail", label: "Gmail", hint: "Cuentas @gmail.com y de Google Workspace" },
  { id: "yahoo", label: "Yahoo", hint: "Cuentas @yahoo" },
  { id: "icloud", label: "iCloud", hint: "Cuentas @icloud.com y @me.com" },
  { id: "custom", label: "Otro (tu hosting)", hint: "Una casilla de tu dominio, con servidor propio" },
];

const STEP_TITLES: Partial<Record<Step, { n: number; title: string }>> = {
  provider: { n: 1, title: "Elegí tu correo" },
  guide: { n: 2, title: "Creá la contraseña de aplicación" },
  credentials: { n: 3, title: "Pegá tus datos" },
  testing: { n: 4, title: "Probando la conexión" },
  done: { n: 4, title: "Listo" },
};

const TESTING = ["Conectando con el servidor…", "Entrando a tu casilla…", "Mirando tu bandeja de entrada…", "Probando que pueda enviar…"] as const;

const field = "w-full rounded-media border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-accent/60";

/**
 * Asistente para conectar la casilla, paso a paso: elegir el proveedor, conseguir una contraseña de aplicación (nunca la de la
 * cuenta), escribir los datos, aceptar el aviso de privacidad y probar la conexión. Si algo falla, explica qué y deja volver
 * a intentar sin perder lo escrito (salvo la contraseña, que se pide de nuevo).
 */
export function ConnectWizard({ agencyId, onConnected, onCancel }: { agencyId: string | null; onConnected: (o: MailOverview) => void; onCancel?: () => void }) {
  const [step, setStep] = useState<Step>("provider");
  const [provider, setProvider] = useState<MailProviderId>("gmail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [imap, setImap] = useState({ host: "", port: 993 });
  const [smtp, setSmtp] = useState({ host: "", port: 465 });
  const [error, setError] = useState<string | null>(null);
  const [testIndex, setTestIndex] = useState(0);
  const preset = provider === "custom" ? null : PRESETS[provider];

  // La lista animada de "probando" avanza sola mientras la llamada real está en curso.
  useEffect(() => {
    if (step !== "testing") return;
    const timers = [1100, 2400, 3800].map((ms, i) => window.setTimeout(() => setTestIndex(i + 1), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [step]);

  const submit = async () => {
    setError(null);
    setTestIndex(0);
    setStep("testing");
    try {
      const o = await mailApi<MailOverview>("/connect", agencyId, {
        method: "POST",
        body: JSON.stringify({ provider, email, password, consent: true, ...(provider === "custom" ? { imap, smtp } : {}) }),
      });
      setPassword("");
      setShowPass(false);
      setStep("done");
      onConnected(o);
    } catch (e) {
      setPassword("");
      setError(e instanceof MailApiError ? e.message : "No se pudo conectar.");
      setStep("credentials");
    }
  };

  const validCreds = /^\S+@\S+\.\S+$/.test(email) && password.replace(/\s/g, "").length >= 6 && consent && (provider !== "custom" || (imap.host.length > 3 && smtp.host.length > 3));

  return (
    <section className="flex max-w-2xl flex-col gap-5 rounded-card bg-surface p-5 shadow-card sm:p-6" aria-labelledby="wizard-title">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="wizard-title" className="font-display text-lg font-bold text-text">
            Conectar tu casilla
          </h2>
          <p className="font-mono text-xs uppercase tracking-wide text-text-muted" aria-live="polite">
            Paso {STEP_TITLES[step]?.n} de 4 · {STEP_TITLES[step]?.title}
          </p>
        </div>
        {onCancel && step !== "testing" && (
          <button type="button" onClick={onCancel} aria-label="Cancelar" className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </header>

      {step === "provider" && (
        <>
          <div className="flex flex-col gap-2.5 rounded-media bg-surface-2 p-4 text-sm text-text-muted">
            <p className="flex items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>
                Para leer tus consultas, tu correo te da una <strong className="font-semibold text-text">contraseña de aplicación</strong>: una clave especial para una sola app. La creás en un par de minutos, la podés borrar cuando quieras y tu contraseña de siempre nunca se comparte.
              </span>
            </p>
            <p>
              Vas a necesitar: <strong className="font-semibold text-text">tu email</strong>, unos 5 minutos y tu celular a mano por si tu proveedor te pide un código.
            </p>
          </div>
          <div role="radiogroup" aria-label="Proveedor de correo" className="grid gap-2.5 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={provider === p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-media p-3.5 text-left transition-[transform,box-shadow,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.98]",
                  provider === p.id ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-surface-sunken"
                )}
              >
                <span className="font-display text-base font-bold text-text">{p.label}</span>
                <span className="text-xs text-text-muted">{p.hint}</span>
              </button>
            ))}
            <div className="flex flex-col gap-0.5 rounded-media bg-surface-2 p-3.5 opacity-60" aria-disabled>
              <span className="font-display text-base font-bold text-text">Outlook / Hotmail</span>
              <span className="text-xs text-text-muted">Próximamente</span>
            </div>
          </div>
          <div>
            <Button onClick={() => setStep("guide")}>
              Continuar <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </>
      )}

      {step === "guide" && (
        <>
          {preset ? (
            <ol className="flex flex-col gap-4">
              {preset.steps.map((s, i) => (
                <li key={s.text} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-2">
                    <span className="text-[15px] text-text">{s.text}</span>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-semibold text-text transition-[color,transform] duration-150 hover:text-accent active:scale-[0.97]"
                      >
                        {s.action ?? "Abrir"} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col gap-3 text-sm text-text-muted">
              <p>
                Vas a necesitar los datos del servidor de tu hosting (los encontrás en su panel o en su ayuda): el de <strong className="text-text">entrada (IMAP)</strong> y el de{" "}
                <strong className="text-text">salida (SMTP)</strong>, y la contraseña de tu casilla. Sólo aceptamos servidores públicos y conexiones seguras (puertos 993 para IMAP; 465 o 587 para SMTP).
              </p>
            </div>
          )}
          {preset?.note && <p className="rounded-media bg-surface-2 px-3.5 py-2.5 text-xs text-text-muted">{preset.note}</p>}
          {preset && preset.trouble.length > 0 && (
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-media border border-border">
              {preset.trouble.map((t) => (
                <details key={t.q} className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
                    {t.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-3.5 pb-3 text-sm text-text-muted">{t.a}</p>
                </details>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setStep("provider")}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Atrás
            </Button>
            <Button onClick={() => setStep("credentials")}>
              Ya la tengo <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </>
      )}

      {step === "credentials" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validCreds) void submit();
          }}
        >
          {error && (
            <p role="alert" className="rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
              {error}
            </p>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Tu email
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email.includes("@") && provider !== "custom" && providerFromEmail(email) !== provider && providerFromEmail(email) !== "custom" && setProvider(providerFromEmail(email))}
              className={field}
              placeholder="consultas@tuinmobiliaria.com"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Contraseña de aplicación
            <span className="relative">
              <input
                type={showPass ? "text" : "password"}
                autoComplete="new-password"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(field, "pr-12")}
                placeholder={provider === "custom" ? "La contraseña de tu casilla" : "xxxx xxxx xxxx xxxx"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                aria-pressed={showPass}
                className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-text-muted transition-colors hover:text-text"
              >
                {showPass ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </span>
            <span className="flex items-start gap-1.5 text-xs font-normal text-text-muted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Pegala tal cual te la mostró tu correo. Se guarda cifrada y nadie la puede ver, ni siquiera el administrador.
            </span>
          </label>

          {provider === "custom" && (
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium text-text">Servidores de tu hosting</legend>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                Entrada (IMAP)
                <input value={imap.host} onChange={(e) => setImap({ ...imap, host: e.target.value })} className={field} placeholder="imap.tudominio.com" autoComplete="off" spellCheck={false} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                Puerto IMAP
                <select value={imap.port} onChange={(e) => setImap({ ...imap, port: Number(e.target.value) })} className={field}>
                  <option value={993}>993 (seguro)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                Salida (SMTP)
                <input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} className={field} placeholder="smtp.tudominio.com" autoComplete="off" spellCheck={false} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                Puerto SMTP
                <select value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} className={field}>
                  <option value={465}>465 (SSL)</option>
                  <option value={587}>587 (STARTTLS)</option>
                </select>
              </label>
            </fieldset>
          )}

          <label className="flex items-start gap-3 rounded-media bg-surface-2 p-3.5 text-sm text-text">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              Entiendo que el agente <strong>lee sólo los mails que lleguen desde ahora</strong> (nunca los anteriores), guarda el texto de las consultas durante 60 días (14 si las ignora) y
              <strong> borra todo al desconectar</strong>. Empieza en modo <strong>con confirmación</strong>: nada se envía sin que lo confirme una persona.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("guide")}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Atrás
            </Button>
            <Button type="submit" disabled={!validCreds}>
              Conectar y probar
            </Button>
          </div>
        </form>
      )}

      {step === "testing" && (
        <ol className="flex flex-col gap-3 py-2" role="status" aria-live="polite">
          {TESTING.map((label, i) => {
            const done = i < testIndex;
            const active = i === testIndex;
            return (
              <li key={label} className={cn("flex items-center gap-3 text-[15px] transition-opacity duration-300", i > testIndex && "opacity-40")}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-accent text-accent-contrast" : "bg-accent-soft text-accent")} aria-hidden>
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn(active ? "font-semibold text-text" : "text-text-muted")}>{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-3 rounded-media bg-success-soft p-4 text-sm text-text">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <span>
              <strong className="font-semibold">Listo, {email} quedó conectada.</strong> Empiezo a leer los mails que lleguen desde ahora. Cada respuesta te la dejo para que la confirmes.
            </span>
          </p>
          {onCancel && (
            <div>
              <Button onClick={onCancel}>Ir a mis mails</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
