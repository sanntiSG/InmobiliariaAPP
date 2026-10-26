/**
 * Entender un mail: qué propiedades de la inmobiliaria nombra, qué clase de consulta es y cómo se le respondería. Es la parte
 * "inteligente" del agente, compartida por la revisión real de la casilla (`pipeline.ts`) y por la simulación "Probá cómo
 * respondería" (`preview.ts`), así las dos se comportan igual. No escribe nada: sólo lee el catálogo publicado de ESA
 * inmobiliaria.
 */
import { answerAsks } from "@/lib/agents/knowledge/answers";
import { classifyMail, SELLER_TOPIC, UNSURE_REASON, type Classification } from "./classify";
import { isInquiry } from "./constants";
import { composeReply, type ReplyProperty } from "./compose";
import { selectForMail, type MailSelection } from "./select";
import type { MailSettingsView } from "./settings";
import { publicSiteUrl, siteHosts } from "./site";

export type AnalyzeCtx = { agencyId: string; agencyName: string; settings: MailSettingsView };

export type AnalyzeInput = {
  subject: string;
  /** Texto ya limpio (sin citas ni firmas). */
  text: string;
  fromName: string | null;
  /** Cambia las frases entre un mail y otro. */
  seed: string;
  /** Viene de un portal inmobiliario reconocido. */
  portal?: boolean;
  /** Propiedades de la conversación anterior con esta persona (para un seguimiento que no las nombra). */
  threadPropertyIds?: string[];
};

export type AnalyzeOptions = {
  /** Una persona dijo "era una consulta": se responde aunque el agente no la hubiera tomado como tal. */
  forceInquiry?: boolean;
};

export type Analysis = {
  selection: MailSelection;
  classification: Classification;
  /** Dirección pública del sitio (para los enlaces de la respuesta), si está configurada. */
  siteUrl: string | null;
  /** Redacta la respuesta; `auto` agrega el aviso de que la preparó un asistente. */
  compose: (auto: boolean) => { subject: string; body: string };
  /** Cuántas preguntas puntuales ("¿tiene pileta?") la publicación no puede contestar porque el dato no está cargado. */
  unanswered: number;
};

/** Enlace público a la ficha de una propiedad, o null si no hay dirección pública configurada. */
export const propertyUrl = (siteUrl: string | null, slug: string): string | null => (siteUrl ? `${siteUrl}/propiedades/${encodeURIComponent(slug)}` : null);

export async function analyzeMail(ctx: AnalyzeCtx, input: AnalyzeInput, opts: AnalyzeOptions = {}): Promise<Analysis> {
  const selection = await selectForMail(ctx.agencyId, { subject: input.subject, text: input.text }, siteHosts(), ctx.settings.maxProperties, {
    threadPropertyIds: input.threadPropertyIds,
  });
  let classification = classifyMail({
    subject: input.subject,
    text: input.text,
    hasPropertyRef: selection.properties.length > 0 || selection.unavailable,
    // Sólo cuenta como "coincide con lo publicado" si lo que se sugiere sí es lo que pidió (no un reemplazo).
    searchHits: selection.alternatives.length > 0 && !selection.fallback,
    portal: input.portal,
    search: selection.search,
  });
  if (opts.forceInquiry && !isInquiry(classification.category)) {
    classification = { ...classification, category: "general", topics: ["general"], confidence: 0.5, uncertain: true, needsHuman: true, reasons: [UNSURE_REASON] };
  }

  // A quien quiere vender o tasar no se le ofrecen propiedades del catálogo: lo atiende una persona.
  const seller = classification.humanTopics.includes(SELLER_TOPIC);

  const siteUrl = publicSiteUrl();
  const toReply = (f: MailSelection["properties"][number]): ReplyProperty => ({ facts: f, url: propertyUrl(siteUrl, f.slug) });

  // Cada pregunta puntual se contesta con los datos de la propiedad (o se dice que no figuran). Para quien quiere vender no hay nada que contestar.
  const answers = seller || !isInquiry(classification.category) ? [] : selection.properties.slice(0, 3).map((p) => ({ title: p.title, ...answerAsks(p, selection.asks) }));
  const unanswered = answers.reduce((n, a) => n + a.missing, 0);

  const compose = (auto: boolean) =>
    composeReply({
      fromName: input.fromName,
      subject: input.subject,
      classification,
      properties: selection.properties.map(toReply),
      unavailable: selection.unavailable,
      alternatives: seller ? [] : selection.alternatives.map(toReply),
      settings: ctx.settings,
      agencyName: ctx.agencyName,
      seed: input.seed,
      auto,
      search: !seller && selection.search.strength > 0 ? { label: selection.search.label, fallback: selection.fallback } : undefined,
      answers: answers.map((a) => ({ title: a.title, sentences: a.sentences, missing: a.missing })),
      inherited: selection.inherited,
    });

  return { selection, classification, siteUrl, compose, unanswered };
}
