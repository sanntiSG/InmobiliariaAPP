"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clapperboard, Unlink } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Button, buttonClasses } from "@/components/ui/Button";

/**
 * Vincula el canal de YouTube de la inmobiliaria. No pide permisos ni acceso a
 * la cuenta: con el link del canal (o su @usuario) alcanza para leer sus
 * videos públicos y elegir cuáles sumar a cada publicación.
 */
export function YouTubeChannelCard({
  initialChannelTitle,
  agencyId,
}: {
  initialChannelTitle: string | null;
  /** Sólo el admin: a qué inmobiliaria pertenece el canal. */
  agencyId?: string;
}) {
  const [channelTitle, setChannelTitle] = useState(initialChannelTitle);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(channel: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dashboard/agency/youtube", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ...(agencyId ? { agencyId } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo vincular el canal.");
      if (data.linked) {
        setChannelTitle(data.channelTitle || "Canal vinculado");
        setValue("");
        setMessage({ kind: "ok", text: "¡Canal vinculado! Ahora elegí qué videos mostrar en cada propiedad (paso de abajo)." });
      } else {
        setChannelTitle(null);
        setMessage({ kind: "ok", text: "Canal desvinculado." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo vincular el canal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Clapperboard className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Videos de YouTube</h2>
          <p className="text-sm text-text-muted">
            Vinculá tu canal para sumar a tus publicaciones videos tipo shorts: recorridos, mostrar la casa, lo que
            quieras. Se ven directamente desde tu cuenta de YouTube, más abajo en cada ficha. No te pedimos
            contraseña ni permisos: usamos solo tus videos públicos.
          </p>
        </div>
      </div>

      {channelTitle && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-media bg-success-soft p-4">
          <p className="flex items-center gap-2 text-sm text-text">
            <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
            Canal vinculado: <strong className="font-semibold">{channelTitle}</strong>
          </p>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save("")}>
            <Unlink className="h-4 w-4" aria-hidden /> Desvincular
          </Button>
        </div>
      )}

      {channelTitle && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-media bg-accent-soft p-4">
          <p className="text-sm text-text">
            <strong className="font-semibold">Para usar tus videos:</strong> Propiedades → editar una publicación → sección
            Videos.
          </p>
          <Link href="/dashboard/propiedades" className={buttonClasses("primary", "sm", "inline-flex items-center gap-1.5")}>
            Ir a Propiedades <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void save(value.trim());
        }}
      >
        <div className="flex-1">
          <FormField
            label={channelTitle ? "Cambiar de canal" : "Link de tu canal"}
            placeholder="https://www.youtube.com/@tuinmobiliaria"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "Verificando…" : "Vincular canal"}
        </Button>
      </form>

      {message && (
        <p className={message.kind === "ok" ? "text-sm font-medium text-success" : "text-sm text-danger"} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
