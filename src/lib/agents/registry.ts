/**
 * Registro de agentes. La plataforma tiene una familia de agentes que comparten conocimiento (ver `knowledge/`) y se
 * parecen por fuera (mascota 3D, nombre y modelo editables por el admin, escenario a pantalla completa) pero cada uno
 * hace una cosa: el asesor inmobiliario conversa, el de marketing guía la creación de publicaciones para redes y el de
 * correo atiende las consultas que llegan al buzón de la inmobiliaria.
 *
 * Es un módulo isomórfico (sin base de datos ni React): lo leen el servidor, el cliente y los scripts de prueba.
 */

export const AGENT_IDS = ["advisor", "marketing", "mail"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Quién puede verlo: `agency` = admin y personas que gestionan una inmobiliaria; `explorer` = el resto. */
export type AgentAudience = "agency" | "explorer";

/** Cómo se maneja el agente: `chat` = conversación; `flow` = pasos guiados; `desk` = bandeja de trabajo. */
export type AgentSurface = "chat" | "flow" | "desk";

export type AgentDef = {
  id: AgentId;
  /**
   * Clave del documento en `AdvisorConfig`. El asesor conserva `"default"` (el que ya existe): no se migra ningún dato,
   * así el despliegue viejo y el nuevo —que comparten la base— leen el mismo documento.
   */
  storageKey: string;
  /** Cómo se muestra mientras el admin no le puso nombre. */
  roleLabel: string;
  /** "tu asesor": para frases ("Soy tu asesor"). */
  roleNoun: string;
  /** Complemento de "Preguntale …" si no tiene nombre. */
  ctaFallback: string;
  audiences: readonly AgentAudience[];
  /** Necesita una inmobiliaria (el admin elige una). */
  needsAgency: boolean;
  /** Ícono de rol, para distinguirlo en el selector cuando los tres comparten el mismo modelo. */
  icon: AgentId;
  surface: AgentSurface;
  /** Descripción inicial (el admin la puede cambiar). */
  defaultDescription: string;
  /** Una línea para la tarjeta de la sección Agentes. */
  tagline: string;
};

export const AGENTS: Record<AgentId, AgentDef> = {
  advisor: {
    id: "advisor",
    storageKey: "default",
    roleLabel: "Asesor",
    roleNoun: "tu asesor",
    ctaFallback: "al asesor",
    audiences: ["agency", "explorer"],
    needsAgency: false,
    icon: "advisor",
    surface: "chat",
    defaultDescription: "Tu asesor inmobiliario: analiza tus números, te cuenta qué cambió y te propone qué hacer.",
    tagline: "Conversa con tus datos: qué rinde, qué cambió y qué conviene hacer.",
  },
  marketing: {
    id: "marketing",
    storageKey: "marketing",
    roleLabel: "Marketing",
    roleNoun: "tu agente de marketing",
    ctaFallback: "al agente de marketing",
    audiences: ["agency"],
    needsAgency: true,
    icon: "marketing",
    surface: "flow",
    defaultDescription: "Tu agente de marketing: elige qué propiedad promocionar y te prepara la imagen y el texto para tus redes.",
    tagline: "Prepara la imagen y el texto de tus publicaciones para redes, paso a paso.",
  },
  mail: {
    id: "mail",
    storageKey: "mail",
    roleLabel: "Correo",
    roleNoun: "tu agente de correo",
    ctaFallback: "al agente de correo",
    audiences: ["agency"],
    needsAgency: true,
    icon: "mail",
    surface: "desk",
    defaultDescription: "Tu agente de correo: lee las consultas que llegan a tu casilla y te prepara la respuesta con tus propiedades.",
    tagline: "Detecta las consultas que llegan a tu mail y las responde con tus propiedades.",
  },
};

export const isAgentId = (v: unknown): v is AgentId => typeof v === "string" && (AGENT_IDS as readonly string[]).includes(v);

/** Audiencia de una cuenta: admin y quienes gestionan una inmobiliaria ya creada son `agency`; el resto, `explorer`. */
export function audienceOf(account: { role: string | null; agencyId: string | null }): AgentAudience {
  if (account.role === "admin") return "agency";
  if ((account.role === "agency_owner" || account.role === "agency_agent") && account.agencyId) return "agency";
  return "explorer";
}

/** Agentes que una cuenta puede llegar a ver (aunque el admin todavía no los haya publicado). */
export function agentsForAudience(audience: AgentAudience): AgentId[] {
  return AGENT_IDS.filter((id) => AGENTS[id].audiences.includes(audience));
}
