/**
 * Entender un mail: qué propiedades de la inmobiliaria nombra, qué clase de consulta es y cómo se le respondería. Es la parte
 * "inteligente" del agente, compartida por la revisión real de la casilla (`pipeline.ts`) y por la simulación "Probá cómo
 * respondería" (`preview.ts`), así las dos se comportan igual. No escribe nada: sólo lee el catálogo publicado de ESA
 * inmobiliaria.
 */
import { classifyMail, type Classification } from "./classify";
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
};

export type Analysis = {
  selection: MailSelection;
  classification: Classification;
  /** Dirección pública del sitio (para los enlaces de la respuesta), si está configurada. */
  siteUrl: string | null;
  /** Redacta la respuesta; `auto` agrega el aviso de que la preparó un asistente. */
  compose: (auto: boolean) => { subject: string; body: string };
};

/** Enlace público a la ficha de una propiedad, o null si no hay dirección pública configurada. */
export const propertyUrl = (siteUrl: string | null, slug: string): string | null => (siteUrl ? `${siteUrl}/propiedades/${encodeURIComponent(slug)}` : null);

export async function analyzeMail(ctx: AnalyzeCtx, input: AnalyzeInput): Promise<Analysis> {
  const selection = await selectForMail(ctx.agencyId, { subject: input.subject, text: input.text }, siteHosts(), ctx.settings.maxProperties);
  const classification = classifyMail({
    subject: input.subject,
    text: input.text,
    hasPropertyRef: selection.properties.length > 0 || selection.unavailable,
    searchHits: selection.alternatives.length > 0,
    portal: input.portal,
  });

  const siteUrl = publicSiteUrl();
  const toReply = (f: MailSelection["properties"][number]): ReplyProperty => ({ facts: f, url: propertyUrl(siteUrl, f.slug) });
  const compose = (auto: boolean) =>
    composeReply({
      fromName: input.fromName,
      subject: input.subject,
      classification,
      properties: selection.properties.map(toReply),
      unavailable: selection.unavailable,
      alternatives: selection.alternatives.map(toReply),
      settings: ctx.settings,
      agencyName: ctx.agencyName,
      seed: input.seed,
      auto,
    });

  return { selection, classification, siteUrl, compose };
}
