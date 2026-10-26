/**
 * Qué dice el asesor cuando no está seguro (aclaración) o no entendió. Dos reglas: 1) nunca finge: si no entendió, lo dice; y
 * 2) aprovecha lo que SÍ leyó (una zona, un tipo de propiedad, una métrica, una propiedad): en vez de tirar la lista genérica de
 * siempre, ofrece caminos concretos sobre ese tema. Las frases salen de bancos con variantes (ver `knowledge/phrasing.ts`).
 */
import { lowerFirst, phrase } from "@/lib/agents/knowledge/phrasing";
import type { AdvisorMode, MetricId, Slots, SuggestionQuery } from "../types";
import { clip, list } from "./format";
import { INTENT_LABELS } from "./labels";
import { sug } from "./suggest";
import { describeSearch, typeLabel } from "./vocab";

const METRIC_NOUN: Record<MetricId, string> = {
  views: "las visitas",
  inquiries: "las consultas",
  saves: "los guardados",
  likes: "los me gusta",
  shares: "las veces que se compartió",
  tour: "el recorrido 360°",
  dwell: "el tiempo en la ficha",
  interest: "el interés",
  conversion: "cuántas visitas terminan en consulta",
};

/** Lo que dice cuando no está seguro de qué se preguntó y ofrece `options` lecturas posibles. */
export function clarifyLead(options: number, turn: number): string {
  if (options <= 1) {
    return phrase(
      "clarify.one",
      ["Creo que preguntás por esto, pero no estoy seguro. ¿Es así?", "No estoy seguro de haber entendido. ¿Te referís a esto?", "Me quedó una duda: ¿querés saber esto?"],
      turn
    );
  }
  return phrase(
    "clarify.many",
    [
      "No estoy seguro de haber entendido bien. ¿Te referís a alguna de estas?",
      "Puedo interpretarlo de más de una forma. ¿Cuál se acerca más a lo que querés saber?",
      "Se me ocurren varias lecturas. ¿Cuál es la tuya?",
      "Para no equivocarme: ¿cuál de estas es la que buscás?",
    ],
    turn
  );
}

/** Lo que dice cuando no entendió, con caminos concretos si pudo leer de qué tema se habla. */
export function unknownHelp(mode: AdvisorMode, slots: Slots, turn: number): { lead: string; followUps: SuggestionQuery[] } {
  return mode === "explorer" ? explorerHelp(slots, turn) : agencyHelp(slots, turn);
}

function explorerHelp(slots: Slots, turn: number) {
  const searchable = !!(slots.zones?.length || slots.types?.length || slots.operation || slots.priceMax || slots.priceMin || slots.rooms != null || slots.bedrooms != null || slots.amenities?.length);
  if (searchable) {
    const what = lowerFirst(describeSearch(slots));
    return {
      lead: phrase(
        "unknown.explorer.topic",
        [
          `Veo que te interesa ${what}, pero no me quedó claro qué querés saber. Puedo mostrarte opciones, decirte cuánto cuestan o ver si bajaron de precio.`,
          `Entendí que hablás de ${what}, pero no sé bien qué querés saber de eso. ¿Te muestro opciones, el precio típico o las que bajaron de precio?`,
          `De ${what} puedo mostrarte propiedades, el precio típico de la zona o lo que bajó de precio. ¿Qué te sirve?`,
        ],
        turn
      ),
      followUps: [
        sug("explorer.search", `Mostrame ${clip(what, 44)}`, { slots }),
        sug("explorer.price_typical", "¿Cuánto cuestan?", { slots }),
        sug("explorer.price_drops", "¿Bajaron de precio?", { slots }),
      ],
    };
  }
  return {
    lead: phrase(
      "unknown.explorer",
      [
        "No encontré cómo ayudarte con eso todavía. Puedo buscar propiedades, recomendarte, comparar precios y mostrarte lo que se mueve. Por ejemplo:",
        "Eso no me salió. Lo mío es buscar propiedades, recomendarte según lo que te gusta y ver cómo están los precios. Probá con alguna de estas:",
        "No lo entendí bien. Si me contás qué tipo de propiedad buscás y en qué zona, te muestro opciones. O elegí una de estas:",
      ],
      turn
    ),
    followUps: [] as SuggestionQuery[],
  };
}

function agencyHelp(slots: Slots, turn: number) {
  if (slots.metric) {
    const noun = METRIC_NOUN[slots.metric];
    return {
      lead: phrase(
        "unknown.agency.metric",
        [
          `Veo que preguntás por ${noun}, pero no me quedó claro qué querés saber. Puedo contarte cómo vienen, qué cambió o cuáles rinden mejor y peor.`,
          `Entendí que se trata de ${noun}, pero no sé bien qué querés saber de eso. ¿Cómo vienen, qué cambió o cuáles andan mejor y peor?`,
        ],
        turn
      ),
      followUps: [
        sug("agency.metric", `¿Cómo vienen ${noun}?`, { slots }),
        sug("agency.changes_vs_previous", INTENT_LABELS["agency.changes_vs_previous"], { slots }),
        sug("agency.worst", INTENT_LABELS["agency.worst"], { slots }),
        sug("agency.best", INTENT_LABELS["agency.best"], { slots }),
      ],
    };
  }
  if (slots.propertyIds?.length) {
    return {
      lead: phrase(
        "unknown.agency.property",
        [
          "Veo que mencionás una de tus propiedades, pero no me quedó claro qué querés saber. Puedo contarte cómo va o investigar por qué rinde como rinde.",
          "Entendí que hablás de una de tus publicaciones, pero no sé bien qué querés saber. ¿Te cuento cómo va o buscamos por qué rinde así?",
        ],
        turn
      ),
      followUps: [sug("agency.property_status", "¿Cómo va esa propiedad?", { slots }), sug("agency.investigate", INTENT_LABELS["agency.investigate"], { slots })],
    };
  }
  const topic = [...(slots.zones ?? []), ...(slots.types ?? []).map((t) => typeLabel(t))];
  if (topic.length > 0) {
    const about = list(topic.slice(0, 3));
    return {
      lead: phrase(
        "unknown.agency.topic",
        [
          `Veo que hablás de ${about}, pero no me quedó claro qué querés saber. Puedo comparar cómo te va por zona o por tipo, o decirte cuáles rinden peor.`,
          `Entendí que se trata de ${about}, pero no sé bien qué querés saber. ¿Comparamos cómo te va por zona o por tipo de propiedad?`,
        ],
        turn
      ),
      followUps: [
        sug("agency.compare_zones", INTENT_LABELS["agency.compare_zones"], { slots }),
        sug("agency.type_interest", INTENT_LABELS["agency.type_interest"], { slots }),
        sug("agency.worst", INTENT_LABELS["agency.worst"], { slots }),
      ],
    };
  }
  return {
    lead: phrase(
      "unknown.agency",
      [
        "Eso no lo puedo responder con los datos de tu inmobiliaria. Puedo ayudarte con tus propiedades, visitas, consultas, cambios y qué mejorar. Por ejemplo:",
        "Con eso no te puedo ayudar todavía. Lo mío son los números de tus publicaciones: visitas, consultas, qué cambió y qué conviene hacer. Probá con alguna de estas:",
        "No lo entendí. Si querés, preguntame cómo vienen tus propiedades, qué cambió o qué conviene revisar. Por ejemplo:",
      ],
      turn
    ),
    followUps: [] as SuggestionQuery[],
  };
}
