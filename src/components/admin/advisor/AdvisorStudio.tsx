"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, FlaskConical, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import { MascotCanvasLazy, type MascotHandle } from "@/components/advisor/mascot/MascotCanvasLazy";
import { readClips } from "@/components/advisor/mascot/scene";
import { openAgent } from "@/components/advisor/store";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";
import type { AdminConfigState, AdvisorContent, AdvisorFraming, AdvisorRoles, ClipInfo, LibraryEntry } from "@/lib/advisor/config";
import { toPublicConfig } from "@/lib/advisor/public-config";
import { AGENTS, type AgentId } from "@/lib/agents/registry";
import type { UnmatchedRow } from "@/app/api/admin/advisor/unmatched/route";

const MODEL_MAX_BYTES = 10 * 1024 * 1024;
const BUNDLED = { source: "bundled" as const, url: "/advisor/agent.glb", label: "Modelo incluido" };

const FRAMING: { key: keyof AdvisorFraming; label: string; min: number; max: number; step: number }[] = [
  { key: "distance", label: "Distancia", min: 0.5, max: 2.5, step: 0.05 },
  { key: "height", label: "Altura", min: -1, max: 1, step: 0.05 },
  { key: "rotationY", label: "Giro", min: -3.2, max: 3.2, step: 0.05 },
  { key: "scale", label: "Escala", min: 0.6, max: 1.6, step: 0.05 },
  { key: "light", label: "Luz", min: 0.3, max: 2.5, step: 0.05 },
];

const card = "rounded-card bg-surface p-5 shadow-card";
const fieldCls = "w-full rounded-media border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-accent/60";

/** Reparte los roles de un modelo nuevo por el nombre de cada animación (si no coincide ninguno, todo queda en reposo). */
function suggestRoles(clips: ClipInfo[], keep?: AdvisorRoles): AdvisorRoles {
  const names = clips.map((c) => c.name);
  const has = (n: string) => names.includes(n);
  if (keep && has(keep.idle)) {
    return { idle: keep.idle, talking: keep.talking.filter(has), surprised: keep.surprised.filter(has), tap: keep.tap.filter(has) };
  }
  const match = (re: RegExp) => names.filter((n) => re.test(n.toLowerCase()));
  const idle = match(/normal|idle|reposo|stand/)[0] ?? names[0] ?? "";
  const talking = match(/habl|talk|speak/);
  const surprised = match(/sorpr|surpris|wow/);
  const used = new Set([idle, ...talking, ...surprised]);
  return { idle, talking, surprised, tap: names.filter((n) => !used.has(n)) };
}

const sizeText = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar la acción.");
  return data as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Estudio de un agente: nombre, modelo 3D, animaciones y encuadre sobre un BORRADOR que se prueba y se publica. Sirve para
 * cualquier agente (`agentId`); lo único propio del asesor es la lista de "preguntas que no entendió". Los modelos 3D
 * subidos son una biblioteca compartida por todos los agentes.
 */
export function AdvisorStudio({ initial, unmatched: initialUnmatched, agentId = "advisor" }: { initial: AdminConfigState; unmatched?: UnmatchedRow[]; agentId?: AgentId }) {
  const router = useRouter();
  const def = AGENTS[agentId];
  const isAdvisor = agentId === "advisor";
  // El asesor conserva sus rutas de siempre; los demás agentes viajan con `?agent=`.
  const ep = useCallback((path = "") => `/api/admin/advisor${path}${isAdvisor ? "" : `?agent=${agentId}`}`, [agentId, isAdvisor]);
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState<AdvisorContent>(initial.draft);
  const [dark, setDark] = useState(false);
  const [talking, setTalking] = useState(false);
  const [surpriseKey, setSurpriseKey] = useState(0);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<LibraryEntry | null>(null);
  const [unmatched, setUnmatched] = useState(initialUnmatched ?? []);
  const viewer = useRef<MascotHandle>(null);
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = useCallback((patch: Partial<AdvisorContent>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  // Autoguardado del borrador (lo publicado no cambia hasta "Publicar").
  useEffect(() => {
    if (!dirty.current) return;
    setStatus("saving");
    const t = window.setTimeout(async () => {
      try {
        const next = await api<AdminConfigState>(ep(), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
        dirty.current = false;
        setState((s) => ({ ...s, hasUnpublished: next.hasUnpublished, library: next.library, published: next.published }));
        setStatus("saved");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [draft, ep]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    const next = await api<AdminConfigState>(ep(), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
    dirty.current = false;
    setState((s) => ({ ...s, hasUnpublished: next.hasUnpublished, library: next.library }));
    setStatus("saved");
  }, [draft, ep]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  // ── Modelo ──
  const selectModel = (model: AdvisorContent["model"], clips: ClipInfo[]) => {
    update({ model, clips, roles: suggestRoles(clips, draft.roles), disabled: [] });
  };

  const libraryModels = state.library;
  const currentUrl = draft.model.url;

  async function uploadModel(file: File) {
    if (!/\.glb$/i.test(file.name)) throw new Error("El modelo tiene que ser un archivo .glb.");
    if (file.size > MODEL_MAX_BYTES) throw new Error(`El modelo pesa más de ${MODEL_MAX_BYTES / (1024 * 1024)} MB.`);
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...head) !== "glTF") throw new Error("El archivo no es un modelo .glb válido.");

    // Las animaciones se leen en el navegador, del propio archivo, antes de subir nada.
    const blobUrl = URL.createObjectURL(file);
    let clips: ClipInfo[];
    try {
      clips = await readClips(blobUrl);
    } catch {
      throw new Error("No pude leer el modelo: ¿está dañado o es muy nuevo?");
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    const sign = await api<{ local: boolean; ticket?: { uploadUrl: string; fields: Record<string, string>; providerId: string } }>(
      "/api/admin/advisor/model/sign",
      json({ filename: file.name, bytes: file.size })
    );

    let next: AdminConfigState;
    if (sign.local || !sign.ticket) {
      const form = new FormData();
      form.set("file", file);
      form.set("clips", JSON.stringify(clips));
      next = await api<AdminConfigState>(ep("/model/local"), { method: "POST", body: form });
    } else {
      const { ticket } = sign;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", ticket.uploadUrl);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("La subida falló. Probá de nuevo.")));
        xhr.onerror = () => reject(new Error("No se pudo conectar para subir el modelo."));
        const form = new FormData();
        for (const [k, v] of Object.entries(ticket.fields)) form.set(k, v);
        form.set("file", file);
        xhr.send(form);
      });
      next = await api<AdminConfigState>(ep("/model"), json({ providerId: ticket.providerId, label: file.name, clips }));
    }
    setState(next);
    const added = next.library[next.library.length - 1];
    if (added) selectModel({ source: "uploaded", url: added.url, providerId: added.providerId, bytes: added.bytes, label: added.label }, added.clips);
  }

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void run("upload", () => uploadModel(file));
  };

  async function deleteModel(entry: LibraryEntry) {
    const next = await api<AdminConfigState>(ep("/model"), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: entry.providerId }) });
    setState(next);
    setToDelete(null);
  }

  // ── Animaciones ──
  const toggle = (list: string[], name: string) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
  const setRole = (role: "talking" | "surprised" | "tap", name: string) => update({ roles: { ...draft.roles, [role]: toggle(draft.roles[role], name) } });
  const clipsDetected = useCallback(
    (clips: ClipInfo[]) => {
      if (clips.length > 0 && JSON.stringify(clips) !== JSON.stringify(draft.clips)) {
        update({ clips, roles: suggestRoles(clips, draft.roles) });
      }
    },
    [draft.clips, draft.roles, update]
  );

  // ── Publicar / descartar / probar ──
  const publish = () =>
    run("publish", async () => {
      await flush();
      const next = await api<AdminConfigState>(ep("/publish"), { method: "POST" });
      setState(next);
      setDraft(next.draft);
      router.refresh();
    });
  const discard = () =>
    run("discard", async () => {
      const next = await api<AdminConfigState>(ep("/discard"), { method: "POST" });
      dirty.current = false;
      setState(next);
      setDraft(next.draft);
    });
  const tryIt = (mode?: "agency" | "explorer") =>
    run("try", async () => {
      await flush();
      // `override`: el escenario se dibuja con el borrador (antes mostraba al asesor publicado aunque se probara otro modelo).
      openAgent(agentId, { mode, preview: true, override: toPublicConfig(draft, agentId) });
    });

  // ── Póster ──
  const capture = () =>
    run("poster", async () => {
      const blob = await viewer.current?.capture(512);
      if (!blob) throw new Error("Esperá a que cargue el modelo para capturar el póster.");
      await flush();
      const form = new FormData();
      form.set("file", new File([blob], "poster.png", { type: "image/png" }));
      const next = await api<AdminConfigState>(ep("/poster"), { method: "POST", body: form });
      setState(next);
      setDraft(next.draft);
    });

  const refreshUnmatched = () =>
    run("unmatched", async () => setUnmatched((await api<{ items: UnmatchedRow[] }>("/api/admin/advisor/unmatched")).items));
  const removeUnmatched = (body: { id: string } | { all: true }) =>
    run("unmatched", async () => {
      await api("/api/admin/advisor/unmatched", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setUnmatched("all" in body ? [] : (u) => u.filter((x) => x.id !== (body as { id: string }).id));
    });

  const models = useMemo(
    () => [{ ...BUNDLED, providerId: undefined as string | undefined, bytes: undefined as number | undefined, clips: draft.model.url === BUNDLED.url ? draft.clips : state.published.clips }, ...libraryModels],
    [libraryModels, draft.model.url, draft.clips, state.published.clips]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de estado: borrador vs publicado */}
      <div className={cn("sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-card px-5 py-3 shadow-card", state.hasUnpublished ? "bg-accent-soft" : "bg-surface")}>
        <p className="min-w-0 flex-1 text-sm text-text">
          {state.hasUnpublished ? <strong>Hay cambios sin publicar.</strong> : "Todo lo que ves está publicado."}{" "}
          <span className="text-text-muted">{status === "saving" ? "Guardando borrador…" : status === "error" ? "No se pudo guardar." : "Borrador guardado."}</span>
        </p>
        {state.hasUnpublished && (
          <Button size="sm" variant="ghost" onClick={discard} disabled={!!busy}>
            Descartar cambios
          </Button>
        )}
        <Button size="sm" onClick={publish} disabled={!state.hasUnpublished || !!busy || status === "saving"}>
          {busy === "publish" ? "Publicando…" : "Publicar"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Visor */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-36 lg:self-start">
          <div className={cn("relative h-[26rem] overflow-hidden rounded-card shadow-card", dark ? "bg-[oklch(15.9%_0.0111_268)]" : "bg-[oklch(96.6%_0.0045_258)]")} aria-label={`Vista previa de ${def.roleNoun}`}>
            <MascotCanvasLazy
              modelUrl={draft.model.url}
              roles={draft.roles}
              disabled={draft.disabled}
              framing={draft.framing}
              base={talking ? "talking" : "idle"}
              surpriseKey={surpriseKey}
              poster={draft.poster}
              forceMotion
              handleRef={viewer}
              onClips={clipsDetected}
              className="h-full"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={talking ? "primary" : "secondary"} onClick={() => setTalking((t) => !t)} aria-pressed={talking}>
              {talking ? "Dejar de hablar" : "Probar hablando"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSurpriseKey((k) => k + 1)}>
              Sorpresa
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDark((d) => !d)} aria-pressed={dark}>
              <Eye className="h-4 w-4" aria-hidden /> Fondo {dark ? "claro" : "oscuro"}
            </Button>
            <Button size="sm" variant="secondary" onClick={capture} disabled={!!busy}>
              <Camera className="h-4 w-4" aria-hidden /> {busy === "poster" ? "Capturando…" : "Capturar póster"}
            </Button>
          </div>
          {draft.poster && (
            <div className="flex items-center gap-3 text-xs text-text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- póster chico y propio */}
              <img src={draft.poster} alt="Póster actual" className="h-14 w-14 rounded-full bg-surface-2 object-contain" />
              Póster del botón flotante.
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => update({ poster: undefined })}>
                Quitar
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {/* Identidad */}
          <section className={card} aria-labelledby="studio-identity">
            <h2 id="studio-identity" className="font-display text-lg font-semibold">
              Identidad
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nombre
                <input className={fieldCls} value={draft.name} maxLength={40} placeholder={`Sin nombre todavía (se muestra “${def.roleLabel}”)`} onChange={(e) => update({ name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Descripción
                <textarea className={cn(fieldCls, "min-h-[5.5rem] resize-y")} value={draft.description} maxLength={300} onChange={(e) => update({ description: e.target.value })} />
              </label>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-medium">Disponible para</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.enabled.agency} onChange={(e) => update({ enabled: { ...draft.enabled, agency: e.target.checked } })} /> Inmobiliarias y admin
                  </label>
                  {def.audiences.includes("explorer") && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={draft.enabled.explorer} onChange={(e) => update({ enabled: { ...draft.enabled, explorer: e.target.checked } })} /> Exploradores
                    </label>
                  )}
                </div>
                {!isAdvisor && (
                  <p className="text-xs text-text-muted">
                    {def.audiences.includes("explorer") ? "" : "Sólo lo ven el admin y las personas de una inmobiliaria. "}
                    Nace apagado: no aparece en el botón flotante de nadie hasta que lo actives y publiques.
                  </p>
                )}
              </fieldset>
            </div>
          </section>

          {/* Modelo */}
          <section className={card} aria-labelledby="studio-model">
            <h2 id="studio-model" className="font-display text-lg font-semibold">
              Modelo 3D
            </h2>
            <p className="mt-1 text-sm text-text-muted">Los modelos subidos son de todos los agentes: lo que subas acá también lo podés elegir en los demás. Hasta que cargues uno propio, usa el modelo incluido.</p>
            <ul className="mt-4 flex flex-col gap-2">
              {models.map((m) => {
                const active = m.url === currentUrl;
                return (
                  <li key={m.url} className={cn("flex items-center gap-3 rounded-media border px-3.5 py-2.5", active ? "border-accent/50 bg-accent-soft" : "border-border")}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="radio" name="model" checked={active} onChange={() => selectModel({ source: m.providerId ? "uploaded" : "bundled", url: m.url, providerId: m.providerId, bytes: m.bytes, label: m.label }, m.clips.length > 0 ? m.clips : draft.clips)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">{m.label ?? "Modelo"}</span>
                        <span className="block text-xs text-text-muted">
                          {m.providerId ? `Subido · ${m.bytes ? sizeText(m.bytes) : ""}` : "Incluido en la plataforma"} · {m.clips.length} animaciones
                        </span>
                      </span>
                    </label>
                    {m.providerId && (
                      <button type="button" aria-label={`Eliminar ${m.label ?? "modelo"}`} className="grid h-9 w-9 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-danger" onClick={() => setToDelete(libraryModels.find((l) => l.providerId === m.providerId) ?? null)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFiles(e.dataTransfer.files);
              }}
              className="mt-4 flex flex-col items-center gap-2 rounded-media border border-dashed border-border px-4 py-6 text-center"
            >
              <Upload className="h-5 w-5 text-text-muted" aria-hidden />
              <p className="text-sm text-text">Arrastrá un archivo <strong>.glb</strong> o</p>
              <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy === "upload"}>
                {busy === "upload" ? (progress != null ? `Subiendo ${Math.round(progress * 100)} %…` : "Preparando…") : "Elegir archivo"}
              </Button>
              <input ref={fileInput} type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <p className="text-xs text-text-muted">Hasta 10 MB. Las animaciones se detectan solas por su nombre.</p>
            </div>
          </section>

          {/* Animaciones */}
          <section className={card} aria-labelledby="studio-clips">
            <h2 id="studio-clips" className="font-display text-lg font-semibold">
              Animaciones
            </h2>
            <p className="mt-1 text-sm text-text-muted">Reposo es la base. Mientras responde alterna las de “Respondiendo”; “Sorpresa” entra cuando el hallazgo es fuera de lo común; “Al tocar” se dispara si alguien toca a la mascota.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted">
                    <th className="pb-2 font-medium">Animación</th>
                    <th className="pb-2 text-center font-medium">Ver</th>
                    <th className="pb-2 text-center font-medium">Activa</th>
                    <th className="pb-2 text-center font-medium">Reposo</th>
                    <th className="pb-2 text-center font-medium" title="Mientras responde">Habla</th>
                    <th className="pb-2 text-center font-medium" title="Cuando el hallazgo es fuera de lo común">Sorpresa</th>
                    <th className="pb-2 text-center font-medium" title="Cuando alguien toca a la mascota">Toque</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.clips.map((c) => {
                    const off = draft.disabled.includes(c.name);
                    return (
                      <tr key={c.name} className="border-t border-border">
                        <td className="py-2 pr-2">
                          <span className="font-medium text-text">{c.name}</span> <span className="text-xs text-text-muted">{c.duration.toFixed(1).replace(".", ",")} s</span>
                        </td>
                        <td className="text-center">
                          <button type="button" aria-label={`Reproducir ${c.name}`} className="grid h-8 w-8 pointer-coarse:size-11 place-items-center rounded-full text-accent hover:bg-accent-soft" onClick={() => viewer.current?.playClip(c.name)}>
                            <Play className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                        <td className="text-center">
                          <input type="checkbox" aria-label={`${c.name} activa`} checked={!off} onChange={() => update({ disabled: toggle(draft.disabled, c.name) })} />
                        </td>
                        <td className="text-center">
                          <input type="radio" name="idle" aria-label={`${c.name} como reposo`} disabled={off} checked={draft.roles.idle === c.name} onChange={() => update({ roles: { ...draft.roles, idle: c.name } })} />
                        </td>
                        {(["talking", "surprised", "tap"] as const).map((role) => (
                          <td key={role} className="text-center">
                            <input type="checkbox" aria-label={`${c.name} en ${role}`} disabled={off} checked={draft.roles[role].includes(c.name)} onChange={() => setRole(role, c.name)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Encuadre */}
          <section className={card} aria-labelledby="studio-framing">
            <div className="flex items-center justify-between gap-3">
              <h2 id="studio-framing" className="font-display text-lg font-semibold">
                Encuadre
              </h2>
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline" onClick={() => update({ framing: { distance: 1, height: 0, rotationY: 0, scale: 1, light: 1 } })}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restablecer
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FRAMING.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5 text-sm font-medium">
                  <span className="flex justify-between">
                    {f.label} <span className="tabular-nums text-text-muted">{draft.framing[f.key].toFixed(2).replace(".", ",")}</span>
                  </span>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={draft.framing[f.key]} onChange={(e) => update({ framing: { ...draft.framing, [f.key]: Number(e.target.value) } })} className="accent-[var(--accent)]" />
                </label>
              ))}
            </div>
          </section>

          {/* Probar */}
          <section className={card} aria-labelledby="studio-try">
            <h2 id="studio-try" className="font-display text-lg font-semibold">
              Probar antes de publicar
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Abre el escenario real con el borrador (nombre, modelo y animaciones).{isAdvisor ? " Las preguntas usan tus datos de admin." : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isAdvisor ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => tryIt("agency")} disabled={!!busy}>
                    <FlaskConical className="h-4 w-4" aria-hidden /> Probar como inmobiliaria
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => tryIt("explorer")} disabled={!!busy}>
                    <FlaskConical className="h-4 w-4" aria-hidden /> Probar como explorador
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => tryIt()} disabled={!!busy}>
                  <FlaskConical className="h-4 w-4" aria-hidden /> Probar {def.roleNoun}
                </Button>
              )}
            </div>
          </section>

          {/* No entendidas (sólo el asesor conversa) */}
          {isAdvisor && (
          <section className={card} aria-labelledby="studio-unmatched">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="studio-unmatched" className="font-display text-lg font-semibold">
                Preguntas que no entendió
              </h2>
              <div className="flex gap-3 text-sm font-semibold">
                <button type="button" className="text-accent hover:underline" onClick={refreshUnmatched}>
                  Actualizar
                </button>
                {unmatched.length > 0 && (
                  <button type="button" className="text-danger hover:underline" onClick={() => removeUnmatched({ all: true })}>
                    Borrar todas
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-text-muted">Anónimas y sin datos personales: sirven para sumar sinónimos o intenciones nuevas. Se borran solas a los 90 días.</p>
            {unmatched.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">Todavía no hay ninguna.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-border">
                {unmatched.map((u) => (
                  <li key={u.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block text-text">{u.text}</span>
                      <span className="text-xs text-text-muted">
                        {u.mode === "agency" ? "Inmobiliaria" : "Explorador"} · {u.kind === "clarify" ? "dudó" : "no entendió"} · {u.count} {u.count === 1 ? "vez" : "veces"}
                      </span>
                    </span>
                    <button type="button" aria-label="Borrar" className="grid h-8 w-8 pointer-coarse:size-11 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-danger" onClick={() => removeUnmatched({ id: u.id })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="¿Eliminar este modelo?"
        confirmLabel="Eliminar"
        busy={busy === "delete"}
        error={error}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void run("delete", () => deleteModel(toDelete))}
      >
        Se borra el archivo {toDelete?.label ? `“${toDelete.label}”` : ""} de la plataforma. Si está en uso, primero elegí otro y publicá.
      </ConfirmDialog>
    </div>
  );
}
