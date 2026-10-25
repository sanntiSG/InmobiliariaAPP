"use client";

import { useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";
import type { MailOverview } from "@/lib/mail/overview";
import { ConnectWizard } from "./ConnectWizard";
import { MailDesk } from "./MailDesk";
import { MailSettingsForm } from "./MailSettingsForm";
import { mailApi, MailApiError } from "./mail-api";

type View = "desk" | "settings" | "connect";

/** La pantalla completa del agente de correo de una inmobiliaria: los mails, la configuración y la conexión de la casilla. */
export function MailCenter({ agencyId, openId }: { agencyId: string | null; openId?: string | null }) {
  const [overview, setOverview] = useState<MailOverview | null>(null);
  const [view, setView] = useState<View>("desk");
  // Cambiar la clave vuelve a montar el escritorio (y a pedir todo) después de conectar o desconectar.
  const [deskKey, setDeskKey] = useState(0);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!overview?.mailbox;
  const canManage = !!overview?.canManage;

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await mailApi<MailOverview>("/connect", agencyId, { method: "DELETE" });
      setConfirmOff(false);
      setView("desk");
      setDeskKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof MailApiError ? e.message : "No se pudo desconectar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {canManage && connected && (
        <div role="tablist" aria-label="Secciones del correo" className="flex gap-1.5">
          {(
            [
              ["desk", "Mis mails"],
              ["settings", "Configuración"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "rounded-pill px-4 py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                view === id ? "bg-accent text-accent-contrast" : "bg-surface text-text-muted shadow-pop hover:text-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {view === "connect" && canManage ? (
        <ConnectWizard
          agencyId={agencyId}
          onConnected={(o) => {
            setOverview(o);
            setDeskKey((k) => k + 1);
          }}
          onCancel={() => setView("desk")}
        />
      ) : view === "settings" && overview && canManage ? (
        <div className="flex flex-col gap-5">
          <MailSettingsForm agencyId={agencyId} initial={overview.settings} onSaved={(s) => setOverview({ ...overview, settings: s })} />
          <section className="flex max-w-2xl flex-col gap-3 rounded-card bg-surface p-5 shadow-card" aria-labelledby="mail-conn">
            <h2 id="mail-conn" className="font-display text-lg font-bold text-text">
              La casilla conectada
            </h2>
            <p className="text-sm text-text-muted">
              {overview.mailbox?.email}. Si cambiaste la contraseña de aplicación o querés usar otra casilla, volvé a conectarla. Al desconectar se borran la contraseña guardada y todos los mails guardados.
            </p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setView("connect")}>
                Reconectar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmOff(true)}>
                <Unplug className="h-4 w-4" aria-hidden /> Desconectar
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <MailDesk key={deskKey} agencyId={agencyId} openId={openId} onOverview={setOverview} onManage={() => setView(connected ? "settings" : "connect")} />
      )}

      <ConfirmDialog
        open={confirmOff}
        title="¿Desconectar la casilla?"
        confirmLabel="Desconectar"
        busy={busy}
        error={error}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => void disconnect()}
      >
        Se borran la contraseña guardada y todos los mails que guardé. Los clientes que ya anoté en tu lista se quedan.
      </ConfirmDialog>
    </div>
  );
}
