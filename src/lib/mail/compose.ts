/**
 * Redacta la respuesta a una consulta, en castellano rioplatense y con la información REAL del catálogo de la inmobiliaria
 * (la misma que arma las fichas y que usa el asesor): nunca inventa un dato, nunca repite lo que escribió quien consultó
 * (así un mail malicioso no se cuela en la respuesta) y varía las frases según una semilla para no sonar siempre igual.
 * Texto plano. Función pura.
 */
import { list, pick, seedOf } from "@/lib/advisor/compose/format";
import { phraseFor } from "@/lib/agents/knowledge/phrasing";
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
  /** Respuestas puntuales a lo que preguntó ("¿tiene pileta?"), una por propiedad mostrada. Vacío si no preguntó nada concreto. */
  answers?: { title: string; sentences: string[]; missing: number }[];
  /** El mail no nombró la propiedad: se retomó la de una conversación anterior con la misma persona. */
  inherited?: boolean;
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

/**
 * Las respuestas a lo que preguntó, en un bloque de texto: una sola propiedad va en una línea ("Sobre lo que nos preguntás: …")
 * o en viñetas si son varias frases; con varias propiedades, una línea por cada una con su título.
 */
function answersFor(answers: ComposeInput["answers"], shown: ReplyProperty[], seed: number): { text: string; missing: number } | null {
  const usable = (answers ?? []).filter((a) => a.sentences.length > 0 && shown.some((s) => s.facts.title === a.title)).slice(0, 3);
  if (usable.length === 0) return null;
  const missing = usable.reduce((n, a) => n + a.missing, 0);
  if (usable.length === 1) {
    const sentences = usable[0]!.sentences;
    const intro = pick(["Sobre lo que nos preguntás:", "Te contesto lo que preguntaste:", "Respecto de tu consulta:"], seed >>> 5);
    return { text: sentences.length === 1 ? `${intro} ${sentences[0]}` : `${intro}\n${sentences.map((s) => `• ${s}`).join("\n")}`, missing };
  }
  return { text: usable.map((a) => `Sobre «${a.title}»: ${a.sentences.join(" ")}`).join("\n"), missing };
}

export function composeReply(input: ComposeInput): { subject: string; body: string } {
  const { settings, classification: c } = input;
  const seed = seedOf(input.seed, input.agencyName);
  // Cada banco de frases arranca en una posición distinta según el mail (la semilla): dos mails seguidos no suenan igual.
  const say = (bank: string, variants: readonly string[]) => phraseFor(`mail.${bank}`, variants, seed);
  const name = firstNameOf(input.fromName);
  const max = Math.max(1, Math.min(5, settings.maxProperties));
  const shown = input.properties.slice(0, max);
  const alternatives = input.alternatives.filter((a) => !shown.some((s) => s.facts.id === a.facts.id)).slice(0, max);
  const top = c.topics[0] ?? c.category;
  const answers = shown.length > 0 ? answersFor(input.answers, shown, seed) : null;
  // Si preguntó algo puntual, la respuesta es lo importante: no se vuelcan todos los datos de la ficha.
  const details = (c.topics.includes("features") || top === "features") && !answers;

  const seller = c.humanTopics.includes(SELLER_TOPIC);
  const parts: string[] = [name ? `Hola ${name},` : "Hola,"];
  // A quien quiere vender se le agradece en su propio párrafo ("Gracias por pensar en nosotros…"): no se agradece dos veces.
  const thanksBelow = seller && shown.length === 0 && alternatives.length === 0 && !input.unavailable;
  const greeting = settings.greeting.trim() || (thanksBelow ? "" : say("thanks", ["Gracias por escribirnos.", "Gracias por tu consulta.", "Gracias por comunicarte con nosotros.", "Gracias por contactarnos."]));
  if (greeting) parts.push(greeting);

  if (shown.length > 0) {
    const one = shown.length === 1;
    const title = shown[0]!.facts.title;
    const lead = input.inherited
      ? one
        ? say("inherited", [`Seguimos con «${title}», la propiedad de tu consulta anterior.`, `Sobre «${title}», la propiedad que veníamos viendo:`])
        : "Seguimos con las propiedades de tu consulta anterior."
      : top === "availability"
        ? one
          ? say("available.one", [`Sí, «${title}» sigue disponible.`, `Te confirmo que «${title}» sigue disponible.`, `«${title}» sigue disponible, sí.`])
          : say("available.many", ["Sí, estas propiedades siguen disponibles:", "Sí, tenemos disponibles estas propiedades:", "Te confirmo que estas propiedades siguen disponibles:"])
        : top === "price"
          ? say("price", ["Te paso el precio y los datos de la propiedad:", "Estos son el precio y los datos:", "Acá va el precio y lo principal de la propiedad:"])
          : top === "features"
            ? answers
              ? ""
              : say("features", ["Te cuento cómo es:", "Estas son sus características:", "Así es la propiedad:"])
            : top === "visit"
              ? say("visit", [
                  "¡Claro! Con gusto coordinamos una visita. Primero, los datos de la propiedad:",
                  "¡Por supuesto! Coordinamos la visita con gusto. Antes, los datos de la propiedad:",
                  "¡Dale! Nos encanta mostrarla. Primero, los datos de la propiedad:",
                ])
              : answers
                ? ""
                : say("general", ["Te cuento sobre la propiedad:", "Estos son los datos que tenemos:", "Esto es lo que tenemos de la propiedad:"]);
    if (lead) parts.push(lead);
    if (answers) {
      parts.push(answers.text);
      if (answers.missing > 0) {
        parts.push(
          say("missing", [
            "Lo que no figura en la publicación lo confirmamos con el equipo y te avisamos.",
            "Eso que no está en la publicación lo consultamos con el equipo y te respondemos.",
            "Lo que falta en la publicación lo averiguamos con el equipo y te lo hacemos saber.",
          ])
        );
      }
      parts.push(say("datos", ["Y estos son los datos de la propiedad:", "Te dejo también los datos de la propiedad:", "Acá tenés además los datos de la propiedad:"]));
    }
    parts.push(shown.map((p) => propertyBlock(p, details)).join("\n\n"));
    if (top === "visit" || c.topics.includes("visit")) {
      parts.push(
        say("visit.when", [
          "Contanos qué días y horarios te quedan mejor y lo coordinamos.",
          "Decinos qué días y horarios te quedan cómodos y lo coordinamos.",
          "Avisanos qué días y horarios te vienen bien y lo coordinamos.",
        ])
      );
    }
  } else if (input.unavailable) {
    parts.push(say("gone", ["Esa propiedad ya no está disponible.", "Lamentablemente, esa propiedad ya no está disponible.", "Te cuento que esa propiedad ya no está disponible."]));
    if (alternatives.length > 0) {
      parts.push(say("gone.alts", ["Mirá estas opciones parecidas que sí tenemos:", "Te dejamos algunas opciones parecidas:", "Estas otras propiedades se le parecen y sí están disponibles:"]));
      parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    } else {
      parts.push(
        say("gone.ask", [
          "Si querés, contanos qué estás buscando (zona, tipo de propiedad y presupuesto) y te enviamos opciones.",
          "Si te sirve, contanos qué buscás (zona, tipo de propiedad y presupuesto) y te mandamos opciones.",
        ])
      );
    }
  } else if (alternatives.length > 0 && input.search?.fallback) {
    parts.push(
      say("nothing.alts", [
        `Por ahora no tenemos nada publicado para ${input.search.label}. Mientras tanto, estas son algunas de nuestras propiedades:`,
        `En este momento no tenemos nada publicado para ${input.search.label}. Mientras tanto, te dejamos algunas de nuestras propiedades:`,
      ])
    );
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push(
      say("budget", [
        "Si querés, contanos tu presupuesto y qué es lo más importante para vos, y te avisamos cuando haya algo que encaje.",
        "Si nos contás tu presupuesto y qué es lo más importante para vos, te avisamos cuando aparezca algo que encaje.",
      ])
    );
  } else if (alternatives.length > 0 && input.search?.label) {
    parts.push(
      say("search.found", [
        `Para ${input.search.label}, esto es lo que tenemos disponible:`,
        `Sobre ${input.search.label}, tenemos disponible:`,
        `Para ${input.search.label} tenemos estas opciones:`,
      ])
    );
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push(visitLine(say, alternatives[0]));
  } else if (alternatives.length > 0) {
    parts.push(
      say("suggest", [
        "Según lo que nos contás, estas propiedades pueden interesarte:",
        "Con lo que buscás, te sugerimos estas propiedades:",
        "Por lo que nos contás, creemos que estas propiedades te pueden gustar; te sugerimos:",
      ])
    );
    parts.push(alternatives.map((p) => propertyBlock(p, false)).join("\n\n"));
    parts.push(visitLine(say, alternatives[0]));
  } else if (seller) {
    parts.push(
      say("seller", [
        "Gracias por pensar en nosotros para tu propiedad. Una persona del equipo se va a comunicar con vos para coordinar la tasación y los pasos que siguen.",
        "Gracias por tenernos en cuenta para tu propiedad. Una persona del equipo se va a poner en contacto con vos para coordinar la tasación y los próximos pasos.",
      ])
    );
  } else if (input.search?.label) {
    parts.push(
      say("search.none", [
        `Por ahora no tenemos nada publicado para ${input.search.label}. Si querés, contanos tu presupuesto y qué es lo más importante para vos, y te avisamos cuando haya algo que encaje.`,
        `En este momento no tenemos nada publicado para ${input.search.label}. Si nos contás tu presupuesto y qué es lo más importante para vos, te avisamos cuando aparezca algo que encaje.`,
      ])
    );
  } else {
    parts.push(
      say("ask", [
        "Para ayudarte mejor, ¿nos contás cuál propiedad te interesó o qué estás buscando (zona, tipo de propiedad y presupuesto)? Con eso te enviamos opciones.",
        "Para poder ayudarte, ¿nos contás cuál propiedad te interesó o qué estás buscando (zona, tipo y presupuesto)? Así te mandamos opciones.",
      ])
    );
  }

  if (c.needsHuman && c.humanTopics.length > 0 && !seller) {
    parts.push(
      say("human", [
        `Sobre ${list(c.humanTopics)}, te lo confirmamos a la brevedad: lo va a revisar una persona del equipo.`,
        `Sobre ${list(c.humanTopics)}, te lo confirmamos a la brevedad: lo va a ver una persona del equipo.`,
        `Sobre ${list(c.humanTopics)}, te lo confirmamos a la brevedad: lo revisa personalmente alguien del equipo.`,
      ])
    );
  }

  parts.push(settings.closing.trim() || say("closing", ["Quedamos atentos a tu respuesta.", "Cualquier duda, escribinos.", "Estamos a disposición.", "Quedamos a tu disposición."]));
  parts.push(settings.signature.trim() || `Equipo de ${input.agencyName}`);
  if (input.auto && settings.disclose) {
    parts.push(`--\nEsta respuesta fue preparada por un asistente automático de ${input.agencyName}. Si necesitás hablar con una persona, respondé este mail.`);
  }

  return { subject: replySubject(input.subject), body: parts.join("\n\n") };
}

/** "Si alguna te interesa, escribinos y coordinamos una visita (por ejemplo, en Palermo)." */
function visitLine(say: (bank: string, variants: readonly string[]) => string, first: ReplyProperty | undefined): string {
  const where = first ? ` (por ejemplo, en ${placeOf(first.facts)})` : "";
  return say("visit.offer", [
    `Si alguna te interesa, escribinos y coordinamos una visita${where}.`,
    `Si alguna te gusta, escribinos y coordinamos una visita${where}.`,
    `Cuando quieras, coordinamos una visita${where}: escribinos y lo vemos.`,
  ]);
}
