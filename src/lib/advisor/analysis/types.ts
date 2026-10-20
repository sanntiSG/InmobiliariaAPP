import type { Portfolio } from "../data/portfolio";
import type {
  AdvisorAction,
  AdvisorBlock,
  AdvisorContext,
  AdvisorMode,
  Slots,
  SuggestionQuery,
} from "../types";

/** Todo lo que un handler necesita para responder. `portfolio` sólo existe en modo inmobiliaria. */
export type Env = {
  mode: AdvisorMode;
  scope: { agencyId: string | null };
  isAdmin: boolean;
  userId: string | null;
  now: Date;
  slots: Slots;
  context: AdvisorContext;
  /** Semilla para variar la redacción de forma determinística. */
  seed: number;
  /** Nombre con el que se presenta el asesor (lo define el admin). */
  persona: { name: string };
  portfolio: Portfolio | null;
};

export type HandlerResult = {
  lead: string;
  blocks: AdvisorBlock[];
  followUps: SuggestionQuery[];
  actions?: AdvisorAction[];
  mood?: "neutral" | "surprised";
  /** Propiedades mostradas: pasan al contexto para "esas", "la primera"… */
  resultIds?: string[];
  focusPropertyId?: string;
  simulated?: boolean;
};

export type Handler = (env: Env) => Promise<HandlerResult> | HandlerResult;

/** `Portfolio` ya cargado (modo inmobiliaria): los handlers de inmobiliaria lo exigen. */
export type AgencyEnv = Env & { portfolio: Portfolio };
export type AgencyHandler = (env: AgencyEnv) => Promise<HandlerResult> | HandlerResult;
