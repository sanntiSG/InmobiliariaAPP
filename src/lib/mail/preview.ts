/**
 * "Probá cómo respondería": le muestra a una persona qué entendería el agente de una consulta y cómo la respondería, SIN
 * conectar ninguna casilla y sin dejar rastro: no guarda el texto, no anota ningún cliente, no avisa a nadie ni envía nada.
 * Usa exactamente el mismo entendimiento que la revisión real (`analyze.ts`) y la configuración actual de la inmobiliaria.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { analyzeMail, propertyUrl } from "./analyze";
import { cleanBody } from "./clean";
import { MAIL_CATEGORY_LABELS, isInquiry, type MailCategory, type MailMode } from "./constants";
import { decideAuto } from "./decide";
import { loadSettings } from "./settings";
import { publicSiteUrl } from "./site";

export const PREVIEW_LIMITS = { text: 4000, subject: 200, name: 80 } as const;

export type PreviewProperty = { title: string; url: string | null };

export type Preview = {
  /** ¿Lo tomaría como una consulta para responder? Si no, `draft` es null y `reasons` dice por qué lo ignoraría. */
  inquiry: boolean;
  category: MailCategory;
  categoryLabel: string;
  confidence: number;
  reasons: string[];
  needsHuman: boolean;
  humanTopics: string[];
  /** Parece una consulta pero no está seguro de qué necesita: la dejaría para que la revise una persona. */
  uncertain: boolean;
  /** Lo que pidió ("casas en venta en Ezeiza"), si pidió algo concreto. */
  searchLabel: string;
  properties: PreviewProperty[];
  /** Nombra una propiedad que ya no está publicada. */
  unavailable: boolean;
  alternatives: PreviewProperty[];
  draft: { subject: string; body: string } | null;
  /** Con la configuración actual: ¿saldría sola o quedaría para confirmar? (suponiendo que quien escribe pasa las verificaciones del correo) */
  autoVerdict: { auto: boolean; why: string } | null;
  /** Si hoy está en "con confirmación": qué pasaría si se pasara a automático (para probar sin cambiar nada). */
  ifAuto: { auto: boolean; why: string } | null;
  mode: MailMode;
};

export async function previewMail(agencyId: string, input: { subject: string; text: string; fromName?: string | null }): Promise<Preview> {
  await connectDB();
  const [settings, agency] = await Promise.all([loadSettings(agencyId), Agency.findById(agencyId).select("name").lean()]);
  const text = cleanBody(input.text.slice(0, PREVIEW_LIMITS.text));
  const subject = input.subject.replace(/[\r\n]+/g, " ").slice(0, PREVIEW_LIMITS.subject);
  const analysis = await analyzeMail(
    { agencyId, agencyName: agency?.name ?? "la inmobiliaria", settings },
    { subject, text, fromName: input.fromName?.trim().slice(0, PREVIEW_LIMITS.name) || null, seed: "preview" }
  );
  const cls = analysis.classification;
  const link = (f: { title: string; slug: string }): PreviewProperty => ({ title: f.title, url: propertyUrl(analysis.siteUrl, f.slug) });
  const base = {
    category: cls.category,
    categoryLabel: MAIL_CATEGORY_LABELS[cls.category],
    confidence: cls.confidence,
    reasons: cls.reasons,
    needsHuman: cls.needsHuman,
    humanTopics: cls.humanTopics,
    uncertain: cls.uncertain,
    searchLabel: analysis.selection.search.strength > 0 ? analysis.selection.search.label : "",
    properties: analysis.selection.properties.map(link),
    unavailable: analysis.selection.unavailable,
    alternatives: analysis.selection.alternatives.map(link),
    mode: settings.mode,
  };
  if (!isInquiry(cls.category)) return { ...base, inquiry: false, draft: null, autoVerdict: null, ifAuto: null };

  const autoInput = {
    category: cls.category,
    confidence: cls.confidence,
    needsHuman: cls.needsHuman,
    authFailed: false,
    replyElsewhere: false,
    availableProperties: analysis.selection.properties.length,
    searchMatches: analysis.selection.fallback ? 0 : analysis.selection.alternatives.length,
    searchStrength: analysis.selection.search.strength,
    sentToday: 0,
    repliesToSender: 0,
    threadAnswered: false,
    now: new Date(),
  };
  const decision = decideAuto({ ...autoInput, settings });
  // En "con confirmación" también se dice qué pasaría en automático, así se prueba sin cambiar la configuración.
  const ifAuto = settings.mode === "auto" ? null : decideAuto({ ...autoInput, settings: { ...settings, mode: "auto" } });
  return { ...base, inquiry: true, draft: analysis.compose(decision.auto), autoVerdict: decision, ifAuto };
}

/** Una consulta de ejemplo (como la escribiría un cliente) para probar al agente. Función pura. */
export function buildSample(args: { title: string; url: string | null }): { subject: string; text: string } {
  const ref = args.url ? `${args.title} (${args.url})` : args.title;
  return {
    subject: `Consulta por ${args.title}`,
    text: `Hola, buen día. Vi la publicación de ${ref}. ¿Sigue disponible? ¿Cuánto sale y cuándo podría ir a verla?\n\nGracias,\nJuan Pérez`,
  };
}

/** La consulta de ejemplo armada con la última propiedad publicada de la inmobiliaria (o null si todavía no tiene ninguna). */
export async function sampleFor(agencyId: string): Promise<{ subject: string; text: string } | null> {
  await connectDB();
  const property = await Property.findOne({ agencyId: new Types.ObjectId(agencyId), status: "published" }).select("title slug").sort({ publishedAt: -1 }).lean();
  if (!property) return null;
  return buildSample({ title: property.title, url: propertyUrl(publicSiteUrl(), property.slug) });
}
