/**
 * Registro de intenciones: cada una declara a qué público sirve, qué señales
 * (conceptos del léxico, combinaciones cercanas o entidades) la identifican y
 * frases de ejemplo para medir similitud. Agregar una intención nueva es
 * agregar una entrada acá + su handler en `analysis/`; nada más cambia.
 */
import type { AdvisorContext, AdvisorMode, IntentId, Slots } from "../types";
import { has, near, type Detected } from "./lexicon";

export type ClassifyInput = {
  norm: string;
  tokens: string[];
  detected: Detected;
  slots: Slots;
  ctx?: AdvisorContext;
  mode: AdvisorMode;
};

export type Signal = { w: number; test: (c: ClassifyInput) => boolean };

export type IntentDef = {
  id: IntentId;
  audience: "agency" | "explorer" | "both";
  signals: Signal[];
  /** Si alguna se cumple, se resta su peso (evita confundir intenciones parecidas). */
  negatives?: Signal[];
  examples: string[];
};

// ─── Constructores de señales ────────────────────────────────────────────────

const any = (w: number, ...concepts: string[]): Signal => ({ w, test: (c) => has(c.detected, ...concepts) });
const both = (w: number, a: string[], b: string[]): Signal => ({
  w,
  test: (c) => has(c.detected, ...a) && has(c.detected, ...b),
});
const close = (w: number, a: string[], b: string[], within = 3): Signal => ({
  w,
  test: (c) => near(c.detected, a, b, within),
});
const when = (w: number, test: (c: ClassifyInput) => boolean): Signal => ({ w, test });

const METRICS = ["m.views", "m.inquiries", "m.saves", "m.likes", "m.shares", "m.interest", "m.tour", "m.comments"];
const FILTER_COUNT = (s: Slots): number =>
  (s.zones?.length ? 1 : 0) +
  (s.types?.length ? 1 : 0) +
  (s.operation ? 1 : 0) +
  (s.amenities?.length ? 1 : 0) +
  (s.priceMax || s.priceMin ? 1 : 0) +
  (s.rooms != null || s.bedrooms != null ? 1 : 0);

// ─── Definiciones ────────────────────────────────────────────────────────────

export const INTENTS: IntentDef[] = [
  // ── Comunes ────────────────────────────────────────────────────────────────
  {
    id: "common.greeting",
    audience: "both",
    signals: [when(7, (c) => has(c.detected, "v.greeting") && c.tokens.length <= 4)],
    examples: ["hola", "buenas", "buen dia", "buenas tardes", "hola como estas"],
  },
  {
    id: "common.thanks",
    audience: "both",
    signals: [when(7, (c) => has(c.detected, "v.thanks") && c.tokens.length <= 4)],
    examples: ["gracias", "genial gracias", "perfecto", "muchas gracias", "dale gracias"],
  },
  {
    id: "common.help",
    audience: "both",
    signals: [any(8, "v.help")],
    examples: ["que podes hacer", "ayuda", "para que servis", "que sabes hacer", "en que me podes ayudar", "como te uso"],
  },

  // ── Inmobiliaria ───────────────────────────────────────────────────────────
  {
    id: "agency.overview",
    audience: "agency",
    signals: [
      any(7, "v.overview"),
      when(6, (c) => has(c.detected, "m.conversion") && !has(c.detected, "q.less", "q.more", "q.but")),
      when(3, (c) => has(c.detected, "v.status") && !c.slots.propertyIds?.length),
      when(2, (c) => c.tokens.length <= 6 && has(c.detected, "v.status") && !c.slots.propertyIds?.length),
    ],
    examples: ["como me fue esta semana", "dame un resumen", "como voy", "como esta todo", "panorama general", "como estoy este mes"],
  },
  {
    id: "agency.worst",
    audience: "agency",
    signals: [
      any(6, "v.worst"),
      close(5, ["q.less"], METRICS, 3),
      when(3, (c) => has(c.detected, "m.interest") && has(c.detected, "q.less")),
      both(1.5, ["v.worst"], ["d.property"]),
    ],
    negatives: [
      any(4, "v.stale"),
      any(5, "v.change_vs"),
      any(5, "v.i_changed"),
      both(6, ["q.but"], ["m.inquiries"]),
      any(4, "v.compare"),
    ],
    examples: [
      "que propiedades estan funcionando peor esta semana",
      "cuales rinden menos",
      "que publicaciones andan mal",
      "las propiedades con peor rendimiento",
      "cuales son las mas flojas",
    ],
  },
  {
    id: "agency.best",
    audience: "agency",
    signals: [
      any(6, "v.best"),
      close(4, ["q.more"], METRICS, 3),
      any(3, "v.popular"),
      both(2, ["m.interest"], ["q.more"]),
    ],
    negatives: [any(5, "v.change_vs"), both(7, ["q.more"], ["d.type"]), any(5, "v.traits"), any(4, "v.worst"), any(5, "v.compare"), any(4, "v.why"), any(4, "d.zone"), any(6, "v.count"), any(7, "v.recommend")],
    examples: [
      "cuales son mis mejores propiedades",
      "que propiedades funcionan mejor",
      "cual tiene mas visitas",
      "las que mas consultas reciben",
      "cual es la mas guardada",
    ],
  },
  {
    id: "agency.views_no_inquiries",
    audience: "agency",
    signals: [
      when(10, (c) => near(c.detected, ["q.more"], ["m.views", "m.saves", "m.likes", "m.shares", "m.interest"], 3) && near(c.detected, ["q.less", "q.neg"], ["m.inquiries"], 3)),
      when(7, (c) => has(c.detected, "m.views") && has(c.detected, "q.but") && has(c.detected, "m.inquiries")),
      when(5, (c) => has(c.detected, "m.conversion") && has(c.detected, "q.less")),
      when(4, (c) => has(c.detected, "q.neg") && has(c.detected, "m.inquiries") && has(c.detected, "m.views")),
      when(3, (c) => has(c.detected, "m.views") && has(c.detected, "m.inquiries") && has(c.detected, "q.less")),
    ],
    examples: [
      "cuales reciben muchas visitas pero pocas consultas",
      "propiedades con muchas visitas y pocas consultas",
      "tengo visitas pero nadie consulta",
      "por que me ven pero no consultan",
      "que propiedades no convierten",
    ],
  },
  {
    id: "agency.investigate",
    audience: "agency",
    signals: [
      any(5, "v.why"),
      when(3, (c) => has(c.detected, "v.why") && (c.slots.propertyIds?.length ?? 0) > 0),
      when(3, (c) => has(c.detected, "v.why") && !!c.ctx?.lastIntent && c.tokens.length <= 6),
    ],
    negatives: [any(4, "v.simulate"), any(4, "v.i_changed"), any(3, "v.recommend")],
    examples: [
      "por que pasa eso",
      "investigar por que",
      "explicame el motivo",
      "por que tiene tantas visitas y pocas consultas",
      "que le pasa a esta propiedad",
    ],
  },
  {
    id: "agency.changes_vs_previous",
    audience: "agency",
    signals: [
      any(6, "v.change_vs"),
      when(3, (c) => has(c.detected, "t.prev") && (has(c.detected, "t.month") || has(c.detected, "t.week"))),
      when(2, (c) => has(c.detected, "v.compare") && has(c.detected, "t.prev")),
    ],
    negatives: [any(7, "v.i_changed"), any(5, "v.activity"), any(3, "v.simulate")],
    examples: [
      "que cambio respecto del mes pasado",
      "como evoluciono todo comparado con la semana pasada",
      "crecio la visualizacion",
      "que paso esta semana",
      "bajaron las visitas",
      "que cambio desde la semana pasada",
    ],
  },
  {
    id: "agency.metric",
    audience: "agency",
    signals: [
      when(7, (c) => has(c.detected, "v.count") && has(c.detected, ...METRICS) && !has(c.detected, "q.more", "q.less")),
      when(3, (c) => has(c.detected, "v.count") && has(c.detected, ...METRICS)),
      when(2, (c) => has(c.detected, ...METRICS) && has(c.detected, "t.today", "t.yesterday", "t.week", "t.month") && c.tokens.length <= 6),
    ],
    negatives: [any(5, "v.change_vs"), any(5, "v.simulate"), any(6, "v.compare")],
    examples: [
      "cuantas visitas tuve esta semana",
      "cuantas consultas recibi este mes",
      "cuantos favoritos tengo",
      "visitas de hoy",
      "total de visitas del mes",
    ],
  },
  {
    id: "agency.review_first",
    audience: "agency",
    signals: [any(6, "v.review"), both(3, ["d.property"], ["v.review"]), any(2, "v.worst")],
    negatives: [any(3, "d.photos"), any(5, "v.simulate")],
    examples: [
      "que publicaciones deberia revisar primero",
      "por cual empiezo",
      "que tengo que atender primero",
      "cuales son las urgentes",
      "que necesita atencion",
    ],
  },
  {
    id: "agency.compare_zones",
    audience: "agency",
    signals: [
      when(8, (c) => (c.slots.zones?.length ?? 0) >= 2),
      both(6, ["v.compare"], ["d.zone"]),
      when(3, (c) => (c.slots.zones?.length ?? 0) === 1 && (has(c.detected, "m.interest") || has(c.detected, ...METRICS))),
      when(5, (c) => (c.slots.zones?.length ?? 0) === 1 && !c.slots.propertyIds?.length),
      when(3, (c) => (c.slots.zones?.length ?? 0) === 1 && has(c.detected, "v.status")),
      any(3, "d.zone"),
    ],
    negatives: [any(4, "v.i_changed"), any(6, "v.simulate"), any(4, "v.recommend")],
    examples: [
      "por que mis departamentos de ezeiza reciben menos consultas que los de canning",
      "compara palermo con belgrano",
      "como me va por zona",
      "que zona rinde mas",
      "diferencia entre ezeiza y canning",
    ],
  },
  {
    id: "agency.type_interest",
    audience: "agency",
    signals: [
      close(6, ["d.type"], [...METRICS, "v.best", "q.more"], 5),
      when(5, (c) => /\bque tipo\b|\bcual tipo\b|\bque clase\b/.test(c.norm)),
      when(3, (c) => (c.slots.types?.length ?? 0) > 0 && has(c.detected, "m.interest")),
    ],
    negatives: [any(5, "v.simulate"), any(3, "v.i_changed")],
    examples: [
      "que tipo de inmueble esta generando mas interes",
      "que tipo de propiedad funciona mejor",
      "casas o departamentos cual rinde mas",
      "que tipo de propiedad me conviene mas",
    ],
  },
  {
    id: "agency.traits",
    audience: "agency",
    signals: [
      any(6, "v.traits"),
      when(7, (c) => has(c.detected, "v.compare") && has(c.detected, "q.more") && has(c.detected, "q.less")),
      when(4, (c) => has(c.detected, "v.compare") && (has(c.detected, "m.saves") || has(c.detected, "m.inquiries"))),
      when(2, (c) => has(c.detected, "m.saves") && has(c.detected, "q.more")),
    ],
    negatives: [both(8, ["q.more"], ["d.type"]), when(5, (c) => (c.slots.zones?.length ?? 0) >= 2)],
    examples: [
      "que caracteristicas tienen las propiedades que reciben mas favoritos",
      "que diferencia hay entre las mas consultadas y las menos consultadas",
      "que tienen en comun las que mas funcionan",
      "como son las propiedades que mas guardan",
    ],
  },
  {
    id: "agency.actions",
    audience: "agency",
    signals: [
      any(6, "v.recommend"),
      when(2, (c) => c.slots.count != null && has(c.detected, "v.recommend")),
      when(3, (c) => has(c.detected, "v.recommend") && has(c.detected, ...METRICS)),
    ],
    negatives: [any(4, "v.simulate"), any(5, "v.promote"), any(5, "v.opportunities")],
    examples: [
      "que tres acciones me recomendarias para mejorar mis resultados",
      "que hago para tener mas consultas",
      "que puedo mejorar",
      "dame ideas para vender mas",
      "que me conviene hacer ahora",
    ],
  },
  {
    id: "agency.photos",
    audience: "agency",
    signals: [any(6, "d.photos"), when(3, (c) => has(c.detected, "d.photos") && (has(c.detected, "v.review") || has(c.detected, "v.recommend") || has(c.detected, "v.incomplete")))],
    // "portada" también es sinónimo de foto: "portada viva" es otra cosa (agency.ambient_cover).
    negatives: [any(5, "v.simulate"), any(5, "v.i_changed"), any(4, "m.tour"), any(9, "d.ambient")],
    examples: [
      "que propiedades necesitan mejores fotografias",
      "cuales tienen pocas fotos",
      "en cuales conviene subir fotos nuevas",
      "que publicaciones tienen mala calidad de fotos",
    ],
  },
  {
    id: "agency.incomplete",
    audience: "agency",
    signals: [any(6, "v.incomplete"), when(3, (c) => has(c.detected, "d.description") && has(c.detected, "q.less"))],
    negatives: [any(4, "v.simulate")],
    examples: [
      "tengo publicaciones incompletas que podrian perjudicar la presentacion",
      "que propiedades les faltan datos",
      "cuales estan a medias",
      "que borradores tengo sin terminar",
      "que le falta a mis publicaciones",
    ],
  },
  {
    id: "agency.stale_inquiries",
    audience: "agency",
    signals: [any(6, "v.stale"), close(4, ["q.less", "q.neg"], ["m.inquiries"], 3), any(2, "t.prev")],
    negatives: [any(5, "v.change_vs"), both(6, ["m.views"], ["q.but"])],
    examples: [
      "que propiedades llevan tiempo sin recibir consultas",
      "cuales estan estancadas",
      "que propiedades nadie consulta",
      "cuales no tienen movimiento",
    ],
  },
  {
    id: "agency.opportunities",
    audience: "agency",
    signals: [
      any(6, "v.opportunities"),
      when(2, (c) => has(c.detected, "v.recommend") && has(c.detected, "q.neg")),
      when(6, (c) => has(c.detected, "q.neg", "q.less") && has(c.detected, "m.tour", "d.video")),
    ],
    negatives: [any(4, "v.simulate"), any(9, "d.ambient")],
    examples: [
      "que oportunidades de mejora todavia no estoy aprovechando",
      "que me estoy perdiendo",
      "que oportunidades tengo",
      "que potencial no estoy usando",
    ],
  },
  {
    id: "agency.simulate_price",
    audience: "agency",
    signals: [
      any(5, "v.simulate"),
      when(4, (c) => c.slots.percent != null),
      close(5, ["v.drop", "v.raise"], ["d.price"], 4),
      when(2, (c) => has(c.detected, "d.price") && has(c.detected, "v.drop")),
    ],
    negatives: [any(7, "v.i_changed"), any(5, "v.effect")],
    examples: [
      "que pasaria si redujera un 5 por ciento el precio de estas propiedades",
      "que pasa si bajo el precio",
      "simula una baja de precio del 10%",
      "y si subo el precio",
      "como afectaria bajar el precio de esta casa",
    ],
  },
  {
    id: "agency.similar_price",
    audience: "agency",
    signals: [
      both(8, ["v.similar"], ["d.price"]),
      any(4, "v.similar"),
      when(3, (c) => has(c.detected, "v.compare") && has(c.detected, "d.price")),
    ],
    negatives: [any(5, "v.simulate")],
    examples: [
      "que propiedades tienen precios similares y distinto nivel de interes",
      "cuales cuestan parecido pero una rinde mas",
      "mismo precio distinto interes",
    ],
  },
  {
    id: "agency.promote",
    audience: "agency",
    signals: [any(8, "v.promote"), when(2, (c) => c.slots.count != null && has(c.detected, "v.promote"))],
    examples: [
      "si quisiera promocionar tres propiedades esta semana cuales elegirias",
      "cuales conviene impulsar",
      "que propiedades destacar en redes",
      "cuales promociono",
    ],
  },
  {
    id: "agency.activity",
    audience: "agency",
    signals: [any(6, "v.activity"), any(6, "v.i_changed")],
    negatives: [any(8, "t.since"), any(6, "v.effect")],
    examples: [
      "que cambie esta semana",
      "mis ultimos cambios",
      "que modifique en mis propiedades",
      "historial de cambios",
      "que toque ayer",
    ],
  },
  {
    id: "agency.change_impact",
    audience: "agency",
    signals: [
      when(8, (c) => has(c.detected, "t.since") && (has(c.detected, "v.i_changed") || has(c.detected, "v.drop") || has(c.detected, "d.price") || has(c.detected, "d.photos") || has(c.detected, "d.description") || has(c.detected, "d.video") || has(c.detected, "d.ambient"))),
      any(6, "v.effect"),
      when(3, (c) => has(c.detected, "t.since") && has(c.detected, ...METRICS)),
    ],
    examples: [
      "desde que baje el precio mejoraron las visitas",
      "sirvio el cambio que hice",
      "funciono cambiar las fotos",
      "que efecto tuvo el cambio de precio",
      "desde que edite la descripcion cambio algo",
    ],
  },
  {
    id: "agency.property_status",
    audience: "agency",
    signals: [
      when(8, (c) => has(c.detected, "v.status") && (c.slots.propertyIds?.length ?? 0) > 0),
      when(5, (c) => (c.slots.propertyIds?.length ?? 0) > 0),
    ],
    // "¿funcionó poner portada viva en la casa de Alan?" nombra una propiedad pero pregunta por un cambio: es de agency.change_impact.
    negatives: [any(5, "v.simulate"), any(5, "v.activity"), any(4, "v.why"), any(6, "v.compare"), when(4, (c) => has(c.detected, "v.effect") && has(c.detected, "d.ambient", "d.photos", "d.price", "d.description", "d.video", "m.tour"))],
    examples: ["como va esta propiedad", "como le fue a la casa de alan", "como esta funcionando la primera", "estado de esa propiedad"],
  },
  {
    id: "agency.ambient_cover",
    audience: "agency",
    signals: [any(8, "d.ambient")],
    // "¿sirvió agregar la portada viva?" y "desde que la puse…" son de agency.change_impact; las simulaciones, de su intención.
    negatives: [any(7, "v.effect"), any(7, "t.since"), any(6, "v.i_changed"), any(5, "v.simulate")],
    examples: [
      "que propiedades tienen portada viva",
      "cuales no tienen portada reactiva",
      "que es la portada viva",
      "me conviene usar portada animada",
      "en cuales conviene poner portada viva",
    ],
  },
  {
    id: "agency.leads",
    audience: "agency",
    signals: [any(6, "v.leads"), close(3, ["m.inquiries"], ["v.status", "q.neg"], 4)],
    negatives: [any(4, "v.simulate")],
    examples: [
      "que clientes tengo sin seguimiento",
      "como va el embudo",
      "cuantos clientes tengo pendientes",
      "tengo consultas sin responder",
    ],
  },

  // ── Explorador ─────────────────────────────────────────────────────────────
  {
    id: "explorer.search",
    audience: "explorer",
    signals: [
      when(4, (c) => FILTER_COUNT(c.slots) >= 1),
      when(4, (c) => FILTER_COUNT(c.slots) >= 2),
      any(3, "v.search", "v.show"),
      when(2, (c) => has(c.detected, "d.property") && FILTER_COUNT(c.slots) >= 1),
    ],
    negatives: [any(6, "v.typical"), any(6, "v.fair_price"), when(6, (c) => has(c.detected, "v.drop") && has(c.detected, "d.price"))],
    examples: [
      "busco un departamento de 2 ambientes en palermo",
      "casas con pileta hasta 200 mil dolares",
      "alquiler de 3 ambientes en belgrano",
      "mostrame departamentos con cochera",
      "quiero comprar una casa en canning",
    ],
  },
  {
    id: "explorer.recommend",
    audience: "explorer",
    signals: [
      any(5, "v.recommend"),
      when(3, (c) => has(c.detected, "v.recommend") && FILTER_COUNT(c.slots) === 0),
      when(2, (c) => /\bpara mi\b|\bpara nosotros\b|\bsegun mis\b|\bme convendria\b/.test(c.norm)),
    ],
    negatives: [
      when(4, (c) => FILTER_COUNT(c.slots) >= 1),
      // "me la recomendás" hablando de UNA propiedad es pedir su opinión (explorer.about_property), no una lista de sugerencias.
      when(6, (c) => has(c.detected, "v.opinion") && ((c.slots.propertyIds?.length ?? 0) === 1 || !!c.ctx?.focusPropertyId)),
    ],
    examples: ["recomendame propiedades", "que me recomendas", "sugeri algo para mi", "que casas me convienen", "dame ideas de propiedades"],
  },
  {
    id: "explorer.price_drops",
    audience: "explorer",
    signals: [close(7, ["v.drop"], ["d.price"], 4), when(4, (c) => has(c.detected, "v.drop") && has(c.detected, "d.property")), any(3, "v.cheap")],
    examples: ["que propiedades bajaron de precio", "mostrame las que bajaron el precio", "rebajas recientes", "propiedades con descuento"],
  },
  {
    id: "explorer.price_typical",
    audience: "explorer",
    signals: [any(6, "v.typical"), when(2, (c) => has(c.detected, "v.typical") && FILTER_COUNT(c.slots) >= 1), any(2, "d.price")],
    negatives: [any(6, "v.fair_price"), close(5, ["v.drop"], ["d.price"], 4)],
    examples: [
      "cuanto cuesta un departamento en palermo",
      "precio promedio de las casas en canning",
      "cuanto salen los alquileres de 2 ambientes",
      "cual es el precio tipico por metro cuadrado",
    ],
  },
  {
    id: "explorer.compare",
    audience: "explorer",
    signals: [any(6, "v.compare"), when(4, (c) => (c.slots.propertyIds?.length ?? 0) >= 2), when(2, (c) => (c.ctx?.resultIds?.length ?? 0) >= 2 && has(c.detected, "v.compare"))],
    examples: ["compara estas dos propiedades", "cual conviene mas de las que me mostraste", "diferencia entre la primera y la segunda", "compara las primeras"],
  },
  {
    id: "explorer.price_check",
    audience: "explorer",
    signals: [any(8, "v.fair_price"), when(3, (c) => has(c.detected, "d.price") && (c.slots.propertyIds?.length ?? 0) > 0)],
    examples: ["esta bien de precio esta propiedad", "es cara", "el precio es razonable", "esta sobrevaluada", "vale lo que cuesta"],
  },
  {
    id: "explorer.about_property",
    audience: "explorer",
    signals: [
      // Pedir una opinión o una descripción sólo tiene sentido si hay UNA propiedad de la que se habla (la ficha o una mencionada).
      when(11, (c) => has(c.detected, "v.opinion") && ((c.slots.propertyIds?.length ?? 0) === 1 || !!c.ctx?.focusPropertyId)),
    ],
    negatives: [
      any(7, "v.fair_price"),
      any(6, "v.compare"),
      when(8, (c) => (c.slots.propertyIds?.length ?? 0) === 0 && !c.ctx?.focusPropertyId),
    ],
    examples: [
      "contame de esta propiedad",
      "me conviene esta casa",
      "que opinas de esta",
      "me la recomendas",
      "describime esta propiedad",
      "que tal es esta",
    ],
  },
  {
    id: "explorer.with_tour",
    audience: "explorer",
    signals: [when(6, (c) => has(c.detected, "m.tour")), when(2, (c) => has(c.detected, "m.tour") && has(c.detected, "v.show", "d.property"))],
    examples: ["propiedades con recorrido 360", "quiero ver casas con tour virtual", "cuales tienen recorrido virtual", "mostrame las que tienen 360"],
  },
  {
    id: "explorer.with_ambient",
    audience: "explorer",
    signals: [any(8, "d.ambient")],
    examples: [
      "propiedades con portada viva",
      "quiero ver casas con portada animada",
      "cuales se ven de dia y de noche",
      "mostrame las que tienen portada reactiva",
    ],
  },
  {
    id: "explorer.new",
    audience: "explorer",
    signals: [any(6, "v.new"), when(2, (c) => has(c.detected, "v.new") && has(c.detected, "t.week", "t.today", "t.yesterday"))],
    negatives: [when(4, (c) => FILTER_COUNT(c.slots) >= 2)],
    examples: ["que hay de nuevo", "propiedades recien publicadas", "las ultimas que se sumaron", "novedades de esta semana"],
  },
  {
    id: "explorer.popular",
    audience: "explorer",
    signals: [any(6, "v.popular"), close(3, ["q.more"], ["m.views", "m.saves", "m.likes", "m.interest"], 3)],
    examples: ["cuales son las mas populares", "que es lo mas buscado", "las mas guardadas", "propiedades en tendencia", "las que mas se ven"],
  },
  {
    id: "explorer.agencies",
    audience: "explorer",
    signals: [any(6, "v.agencies")],
    examples: ["que inmobiliarias hay en palermo", "quien vende en canning", "inmobiliarias de la zona", "quienes publican en belgrano"],
  },
];

export const INTENT_BY_ID = new Map<IntentId, IntentDef>(INTENTS.map((i) => [i.id, i]));

export function intentsFor(mode: AdvisorMode): IntentDef[] {
  return INTENTS.filter((i) => i.audience === "both" || i.audience === mode);
}
