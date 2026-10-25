/**
 * Redacta la respuesta a una consulta, en castellano rioplatense y con la información REAL del catálogo de la inmobiliaria
 * (la misma que arma las fichas y que usa el asesor): nunca inventa un dato, nunca repite lo que escribió quien consultó
 * (así un mail malicioso no se cuela en la respuesta) y varía las frases según una semilla para no sonar siempre igual.
 * Texto plano. Función pura.
 */
import { list, pick, seedOf } from "@/lib/advisor/compose/format";
import { describeLine, factItems, firstSentences, highlights, placeOf, type PropertyFacts } from "@/lib/agents/knowledge/facts";
import { SELLER_TOPIC, type Classification } from "./classify";
import { firstNameOf } from "./prefilter";

export type ReplyProperty = { facts: PropertyFacts; /** Enlace a la ficha, o `null` si no hay dirección pública configurada. */ url: string | null };

export type ReplySettings = { signature: string; greeting: string; closing: string; disclose: boolean; maxProperties: number };

export type ComposeInput = {
  fromName: string | null;
  subject: string;
  classification: Pick<Classification, "topics" | "category" | "needsHuman" | "humanTopics">;
  /** Las propiedades de la inmobiliaria a las que se refiere el mail y están publicadas. */
  properties: ReplyProperty[];
  /** El mail nombra una propiedad que ya no está publicada. */
  unavailable: boolean;
  /** Opciones parecidas (o lo que encaja con lo que pide, si no nombró ninguna). */
  alternatives: ReplyProperty[];
  settings: ReplySettings;
  agencyName: string;
  /** Cambia las frases entre un mail y otro (el id del mail). */
  seed: string;
  /** La respuesta sale sola (sin que una persona la revise): se agrega el aviso de asistente automático. */
  auto: boolean;
  /** Lo que pidió ("casas en venta en Ezeiza"), si pidió algo concreto; `fallback`: lo que se sugiere no coincide, es lo más reciente. */
  search?: { label: string; fallback: boolean };
};

const FEATURE_ICONS = new Set(["rooms", "bedrooms", "bathrooms", "area", "garage", "age", "floor", "orientation", "amenity"]);

/** Asunto de la respuesta: sin saltos de línea (evita inyectar encabezados), sin "Re:" repetidos y con largo acotado. */
export function replySubject(subject: string | null | undefined): string {
  const base = (subject ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/^\s*((re|rv|fwd?|fw)\s*:\s*)+/i, "")
    .trim()
    .slice(0, 150);
  return `Re: ${base || "Tu consulta"}`;
}

function propertyBlock(p: ReplyProperty, withDetails: boolean): string {
  const lines = [`• ${p.facts.title}`, `  ${describeLine(p.facts)}`];
  const extras = highlights(p.facts, 4);
  if (extras.length > 0) lines.push(`  Tiene ${list(extras)}.`);
  if (withDetails) {
    const data = factItems(p.facts)
      .filter((i) => FEATURE_ICONS.has(i.icon))
      .map((i) => `${i.label}: ${i.value}`);
    if (data.length > 0) lines.push(`  Datos: ${data.join(" · ")}.`);
    const about = firstSentences(p.facts.description, 160);
    if (about) lines.push(`  ${about}`);
  }
  if (p.url) lines.push(`  Más fotos y detalles: ${p.url}`);
  return lines.join("\n");
}

export function composeReply(input: ComposeInput): { subject: string; body: string } {
  const { settings, classification: c } = input;
  const seed = seedOf(input.seed, input.agencyName);
  const name = firstNameOf(input.fromName);
  const max = Math.max(1, Math.min(5, settings.maxProperties));
  const shown = input.properties.slice(0, max);
  const alternatives = input.alternatives.filter((a) => !shown.some((s) => s.facts.id === a.facts.id)).slice(0, max);
  const top = c.topics[0] ?? c.category;
  const details = c.topics.includes("features") || top === "features";

  const seller = c.humanTopics.includes(SELLER_TOPIC);
  const parts: string[] = [name ? `Hola ${name},` : "Hola,"];
  parts.push(settings.greeting.trim() || pick(["Gracias por escribirnos.", "Gracias por tu consulta.", "Gracias por comunicarte con nosotros."], seed));

  if (shown.length > 0) {
    const one = shown.length === 1;
    const lead =
      top === "availability"
        ? one
          ? `Sí, «${shown[0]!.facts.title}» sigue disponible.`
          : pick(["Sí, estas propiedades siguen disponibles:", "Sí, tenemos disponibles estas propiedades:"], seed >>> 2)
        : top === "price"
          ? pick(["Te paso el precio y los datos de la propiedad:", "Estos son el precio y los datos:"], seed >>> 2)
          : top === "features"
            ? pick(["Te cuento cómo es:", "Estas son sus características:"], seed >>> 2)
            : top === "visit"
              ? "¡Claro! Con gusto coordinamos una visita. Primero, los datos de la propiedad:"
              : pick(["Te cuento sobre la propiedad:", "Estos son los datos que tenemos:"], seed >>> 2);
    parts.push(lead);
    parts.push(shown.map((p) => propertyBlock(p, details)).join("\n\n"));
    if (top === "visit" || c.topics.includes("visit")) parts.push("Contanos qué días y horarios te quedan mejor y lo coordinamos.");
  } else if (input.unavailable) {
    parts.push("Esa propiedad ya no está disponible.");
    if (alternatives.length > 0) {
      parts.push(pick(["Mirá estas opciones parecidas que sí tenemos:", "Te dejamos algunas opciones parecidas:"], seed >>> 2));
      parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    } else {
      parts.push("Si querés, contanos qué estás buscando (zona, tipo de propiedad y presupuesto) y te enviamos opciones.");
    }
  } else if (alternatives.length > 0 && input.search?.fallback) {
    parts.push(`Por ahora no tenemos nada publicado para ${input.search.label}. Mientras tanto, estas son algunas de nuestras propiedades:`);
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push("Si querés, contanos tu presupuesto y qué es lo más importante para vos, y te avisamos cuando haya algo que encaje.");
  } else if (alternatives.length > 0 && input.search?.label) {
    parts.push(pick([`Para ${input.search.label}, esto es lo que tenemos disponible:`, `Sobre ${input.search.label}, tenemos disponible:`], seed >>> 2));
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push(`Si alguna te interesa, escribinos y coordinamos una visita${alternatives[0] ? ` (por ejemplo, en ${placeOf(alternatives[0].facts)})` : ""}.`);
  } else if (alternatives.length > 0) {
    parts.push(pick(["Según lo que nos contás, estas propiedades pueden interesarte:", "Con lo que buscás, te sugerimos estas propiedades:"], seed >>> 2));
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push(`Si alguna te interesa, escribinos y coordinamos una visita${alternatives[0] ? ` (por ejemplo, en ${placeOf(alternatives[0].facts)})` : ""}.`);
  } else if (seller) {
    parts.push("Gracias por pensar en nosotros para tu propiedad. Una persona del equipo se va a comunicar con vos para coordinar la tasación y los pasos que siguen.");
  } else if (input.search?.label) {
    parts.push(`Por ahora no tenemos nada publicado para ${input.search.label}. Si querés, contanos tu presupuesto y qué es lo más importante para vos, y te avisamos cuando haya algo que encaje.`);
  } else {
    parts.push("Para ayudarte mejor, ¿nos contás cuál propiedad te interesó o qué estás buscando (zona, tipo de propiedad y presupuesto)? Con eso te enviamos opciones.");
  }

  if (c.needsHuman && c.humanTopics.length > 0 && !seller) {
    parts.push(`Sobre ${list(c.humanTopics)}, te lo confirmamos a la brevedad: lo va a revisar una persona del equipo.`);
  }

  parts.push(settings.closing.trim() || pick(["Quedamos atentos a tu respuesta.", "Cualquier duda, escribinos.", "Estamos a disposición."], seed >>> 4));
  parts.push(settings.signature.trim() || `Equipo de ${input.agencyName}`);
  if (input.auto && settings.disclose) {
    parts.push(`--\nEsta respuesta fue preparada por un asistente automático de ${input.agencyName}. Si necesitás hablar con una persona, respondé este mail.`);
  }

  return { subject: replySubject(input.subject), body: parts.join("\n\n") };
}
