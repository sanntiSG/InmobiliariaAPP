import type { AdvisorMode, IntentId, SuggestionQuery } from "../types";
import { sug } from "./suggest";

/** Cómo se le muestra cada intención al usuario cuando hay que aclarar o presentar opciones. */
export const INTENT_LABELS: Record<IntentId, string> = {
  "agency.overview": "Dame un resumen general",
  "agency.metric": "¿Cuántas visitas tuve?",
  "agency.worst": "¿Qué propiedades rinden peor?",
  "agency.best": "¿Cuáles funcionan mejor?",
  "agency.views_no_inquiries": "¿Cuáles tienen visitas pero pocas consultas?",
  "agency.investigate": "Investigar por qué",
  "agency.changes_vs_previous": "¿Qué cambió respecto del período anterior?",
  "agency.review_first": "¿Qué debería revisar primero?",
  "agency.compare_zones": "¿Cómo me va por zona?",
  "agency.type_interest": "¿Qué tipo de propiedad genera más interés?",
  "agency.traits": "¿Qué tienen en común las que mejor funcionan?",
  "agency.actions": "¿Qué me recomendás hacer?",
  "agency.photos": "¿Cuáles necesitan mejores fotos?",
  "agency.incomplete": "¿Tengo publicaciones incompletas?",
  "agency.stale_inquiries": "¿Cuáles llevan tiempo sin consultas?",
  "agency.opportunities": "¿Qué oportunidades no estoy aprovechando?",
  "agency.simulate_price": "¿Qué pasaría si bajo el precio?",
  "agency.similar_price": "¿Qué propiedades cuestan parecido y rinden distinto?",
  "agency.promote": "¿Cuáles conviene promocionar?",
  "agency.activity": "¿Qué cambié últimamente?",
  "agency.change_impact": "¿Sirvió el último cambio que hice?",
  "agency.property_status": "¿Cómo va una propiedad?",
  "agency.leads": "¿Qué clientes tengo sin seguimiento?",
  "agency.ambient_cover": "¿Cuáles tienen portada viva?",
  "explorer.search": "Buscar propiedades",
  "explorer.recommend": "Recomendame propiedades",
  "explorer.price_drops": "¿Cuáles bajaron de precio?",
  "explorer.price_typical": "¿Cuánto cuesta una propiedad por zona?",
  "explorer.compare": "Comparar propiedades",
  "explorer.price_check": "¿Está bien de precio esta propiedad?",
  "explorer.with_tour": "Propiedades con recorrido 360°",
  "explorer.with_ambient": "Propiedades con portada viva",
  "explorer.new": "¿Qué hay de nuevo?",
  "explorer.popular": "¿Cuáles son las más populares?",
  "explorer.agencies": "¿Qué inmobiliarias hay en una zona?",
  "explorer.about_property": "¿Me conviene esta propiedad?",
  "common.greeting": "Hola",
  "common.thanks": "Gracias",
  "common.help": "¿Qué podés hacer?",
};

/** Sugerencias de arranque cuando no hay nada más específico que ofrecer. */
export function defaultSuggestions(mode: AdvisorMode): SuggestionQuery[] {
  const ids: IntentId[] =
    mode === "agency"
      ? ["agency.overview", "agency.views_no_inquiries", "agency.review_first", "agency.actions", "agency.activity", "agency.opportunities"]
      : ["explorer.recommend", "explorer.price_drops", "explorer.new", "explorer.popular", "explorer.with_tour", "explorer.price_typical"];
  return ids.map((id) => sug(id, INTENT_LABELS[id]));
}
