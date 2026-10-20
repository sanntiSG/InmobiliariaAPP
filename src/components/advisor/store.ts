/**
 * Estado del asesor en MEMORIA del navegador: vive en el layout raíz, así que la charla sigue
 * al navegar entre páginas y se pierde al refrescar (a propósito: nada se guarda). Un store
 * mínimo con `useSyncExternalStore` — sin librerías ni contexto que re-renderice todo.
 */
import { useSyncExternalStore } from "react";
import type { PublicAdvisorConfig } from "@/lib/advisor/config";
import type {
  AdvisorAnswer,
  AdvisorBriefing,
  AdvisorContext,
  AdvisorMode,
  AdvisorQuota,
  IntentId,
  Slots,
} from "@/lib/advisor/types";

export type Turn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; status: "pending" }
  | { id: number; role: "assistant"; status: "done"; answer: AdvisorAnswer; fresh: boolean }
  | { id: number; role: "assistant"; status: "error"; message: string; retry?: AskInput };

export type AskInput = { text: string } | { query: { intent: IntentId; slots?: Slots }; label: string };

export type Thread = {
  turns: Turn[];
  context: AdvisorContext;
  briefing: AdvisorBriefing | null;
  briefingState: "idle" | "loading" | "error";
  quota: AdvisorQuota | null;
};

export type Account = { signedIn: boolean; role: string | null; agencyId: string | null };

export type AdvisorState = {
  open: boolean;
  mode: AdvisorMode;
  config: PublicAdvisorConfig | null;
  account: Account;
  /** Sólo el admin: inmobiliaria elegida en el panel (`?agencyId=`). */
  agencyId: string | null;
  /** Prueba del estudio del admin: usa el borrador. */
  preview: boolean;
  focusPropertyId: string | null;
  /** Rect del lanzador, para abrir el escenario desde ahí. */
  origin: { x: number; y: number; w: number; h: number } | null;
  threads: Record<AdvisorMode, Thread>;
};

const MAX_TURNS = 60;

const emptyThread = (): Thread => ({
  turns: [],
  context: { turn: 0 },
  briefing: null,
  briefingState: "idle",
  quota: null,
});

let state: AdvisorState = {
  open: false,
  mode: "explorer",
  config: null,
  account: { signedIn: false, role: null, agencyId: null },
  agencyId: null,
  preview: false,
  focusPropertyId: null,
  origin: null,
  threads: { agency: emptyThread(), explorer: emptyThread() },
};

const listeners = new Set<() => void>();
let seq = 0;

function set(patch: Partial<AdvisorState> | ((s: AdvisorState) => Partial<AdvisorState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

function patchThread(mode: AdvisorMode, patch: Partial<Thread> | ((t: Thread) => Partial<Thread>)) {
  set((s) => {
    const t = s.threads[mode];
    return { threads: { ...s.threads, [mode]: { ...t, ...(typeof patch === "function" ? patch(t) : patch) } } };
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function useAdvisorState(): AdvisorState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const getAdvisorState = () => state;

/** Modo según la cuenta: inmobiliaria si es admin o gestiona una inmobiliaria ya creada; si no, explorador. */
export function modeFor(account: Account): AdvisorMode {
  if (account.role === "admin") return "agency";
  if ((account.role === "agency_owner" || account.role === "agency_agent") && account.agencyId) return "agency";
  return "explorer";
}

// ─── Acciones ────────────────────────────────────────────────────────────────

export function configure(config: PublicAdvisorConfig, account: Account) {
  const nextMode = modeFor(account);
  const changed = state.account.role !== account.role || state.account.agencyId !== account.agencyId || state.account.signedIn !== account.signedIn;
  set({
    config,
    account,
    mode: state.preview ? state.mode : nextMode,
    // Cambió la persona (cerró sesión, otra cuenta): la charla anterior ya no corresponde.
    ...(changed ? { threads: { agency: emptyThread(), explorer: emptyThread() } } : {}),
  });
}

export function setAgencyId(agencyId: string | null) {
  if (state.agencyId === agencyId) return;
  set({ agencyId, threads: { ...state.threads, agency: emptyThread() } });
}

export type OpenOptions = {
  mode?: AdvisorMode;
  preview?: boolean;
  focusPropertyId?: string | null;
  origin?: DOMRect | null;
  /** Una pregunta lista para hacer apenas abre ("Investigar por qué"). */
  ask?: AskInput;
};

export function openAdvisor(opts: OpenOptions = {}) {
  const mode = opts.mode ?? (opts.preview ? state.mode : modeFor(state.account));
  set({
    open: true,
    mode,
    preview: !!opts.preview,
    focusPropertyId: opts.focusPropertyId ?? null,
    origin: opts.origin ? { x: opts.origin.x, y: opts.origin.y, w: opts.origin.width, h: opts.origin.height } : state.origin,
  });
  if (!state.threads[mode].briefing && state.threads[mode].briefingState !== "loading") void loadBriefing(mode);
  if (opts.ask) void ask(mode, opts.ask);
}

export function closeAdvisor() {
  set({ open: false });
}

export function resetThread(mode: AdvisorMode) {
  patchThread(mode, emptyThread());
  void loadBriefing(mode);
}

export async function loadBriefing(mode: AdvisorMode) {
  patchThread(mode, { briefingState: "loading" });
  try {
    const res = await fetch("/api/advisor/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        mode,
        ...(mode === "agency" && state.agencyId ? { agencyId: state.agencyId } : {}),
        ...(mode === "explorer" && state.focusPropertyId ? { focusPropertyId: state.focusPropertyId } : {}),
        ...(state.preview ? { preview: true } : {}),
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const briefing = (await res.json()) as AdvisorBriefing;
    patchThread(mode, { briefing, briefingState: "idle", quota: briefing.quota ?? state.threads[mode].quota });
  } catch {
    patchThread(mode, { briefingState: "error" });
  }
}

export function markStreamed(mode: AdvisorMode, turnId: number) {
  patchThread(mode, (t) => ({
    turns: t.turns.map((x) => (x.id === turnId && x.role === "assistant" && x.status === "done" ? { ...x, fresh: false } : x)),
  }));
}

export async function ask(mode: AdvisorMode, input: AskInput) {
  const thread = state.threads[mode];
  // Una pregunta a la vez; y con el cupo agotado no se manda nada al servidor.
  if (thread.turns.some((t) => t.role === "assistant" && t.status === "pending")) return;
  if (thread.quota?.requiresAccount) return;

  const userId = ++seq;
  const pendingId = ++seq;
  const text = "text" in input ? input.text : input.label;
  const body = {
    mode,
    ...(mode === "agency" && state.agencyId ? { agencyId: state.agencyId } : {}),
    input: "text" in input ? { text: input.text } : { query: input.query },
    context: thread.context,
    ...(state.preview ? { preview: true } : {}),
  };

  patchThread(mode, (t) => ({
    turns: [...t.turns, { id: userId, role: "user", text } as Turn, { id: pendingId, role: "assistant", status: "pending" } as Turn].slice(-MAX_TURNS),
  }));

  const replace = (turn: Turn) =>
    patchThread(mode, (t) => ({ turns: t.turns.map((x) => (x.id === pendingId ? turn : x)) }));

  try {
    const res = await fetch("/api/advisor/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error("Demasiadas preguntas seguidas. Esperá un momento.");
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "No pude responder ahora.");
    }
    const answer = (await res.json()) as AdvisorAnswer;
    replace({ id: pendingId, role: "assistant", status: "done", answer, fresh: true });
    patchThread(mode, (t) => ({ context: answer.context, quota: answer.quota ?? t.quota }));
  } catch (err) {
    replace({ id: pendingId, role: "assistant", status: "error", message: err instanceof Error ? err.message : "No pude responder ahora.", retry: input });
  }
}
