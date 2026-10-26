/**
 * Regresión del motor de interpretación del asesor — sin base de datos.
 * Cada caso es una pregunta real en español con la intención (y entidades)
 * esperadas. Correr con `npm run advisor:check`: sale con código 1 si alguno falla.
 */
import { buildEntityIndex } from "../src/lib/advisor/nlu/entities";
import { understand } from "../src/lib/advisor/nlu/classify";
import type { AdvisorContext, AdvisorMode, Slots } from "../src/lib/advisor/types";
import { stemSet } from "../src/lib/agents/knowledge/similarity";
import type { TaughtExamples } from "../src/lib/advisor/nlu/classify";

const index = buildEntityIndex({
  zones: ["Ezeiza", "Canning", "Palermo", "Palermo Soho", "Belgrano", "Villa Crespo", "Tigre", "Nordelta", "San Isidro", "Caballito"],
  properties: [
    { id: "p1", title: "Casa de Alan" },
    { id: "p2", title: "Departamento 3 ambientes en Palermo Soho" },
    { id: "p3", title: "Casa en Canning con pileta" },
    { id: "p4", title: "Monoambiente luminoso en Belgrano" },
  ],
});

type Case = {
  q: string;
  mode?: AdvisorMode;
  /** Una o varias intenciones aceptadas ("clarify" y "unknown" también valen). */
  expect: string;
  slots?: Partial<Record<keyof Slots, unknown>>;
  ctx?: AdvisorContext;
};

const A = (q: string, expect: string, slots?: Case["slots"], ctx?: AdvisorContext): Case => ({ q, expect, slots, ctx, mode: "agency" });
const E = (q: string, expect: string, slots?: Case["slots"], ctx?: AdvisorContext): Case => ({ q, expect, slots, ctx, mode: "explorer" });

const afterWorst: AdvisorContext = { turn: 1, lastIntent: "agency.worst", lastSlots: { zones: ["Ezeiza"], period: "week" }, resultIds: ["p1", "p2", "p3"] };
const afterChanges: AdvisorContext = { turn: 1, lastIntent: "agency.changes_vs_previous", lastSlots: { period: "week" } };
const focusP2: AdvisorContext = { turn: 1, focusPropertyId: "p2" };
const afterSearch: AdvisorContext = { turn: 1, lastIntent: "explorer.search", lastSlots: { types: ["departamento"] }, resultIds: ["p2", "p4", "p3"] };

const CASES: Case[] = [
  // ── Los ejemplos del pedido ────────────────────────────────────────────────
  A("¿Qué propiedades están funcionando peor esta semana?", "agency.worst", { period: "week" }),
  A("¿Cuáles reciben muchas visitas, pero pocas consultas?", "agency.views_no_inquiries"),
  A("¿Qué cambió respecto del mes pasado?", "agency.changes_vs_previous", { period: "month" }),
  A("¿Qué publicaciones debería revisar primero?", "agency.review_first"),
  A("¿Por qué mis departamentos de Ezeiza reciben menos consultas que los de Canning?", "agency.compare_zones", { zones: ["Ezeiza", "Canning"], types: ["departamento"] }),
  A("¿Qué características tienen las propiedades que reciben más favoritos?", "agency.traits"),
  A("¿Qué diferencia hay entre las propiedades más consultadas y las menos consultadas?", "agency.traits"),
  A("¿Qué tipo de inmueble está generando más interés?", "agency.type_interest"),
  A("¿Qué tres acciones me recomendarías para mejorar mis resultados?", "agency.actions", { count: 3 }),
  A("¿Qué propiedades necesitan mejores fotografías?", "agency.photos"),
  A("¿Tengo publicaciones incompletas que podrían estar perjudicando su presentación?", "agency.incomplete"),
  A("¿Qué propiedades llevan tiempo sin recibir consultas?", "agency.stale_inquiries"),
  A("¿Qué oportunidades de mejora todavía no estoy aprovechando?", "agency.opportunities"),
  A("¿Qué pasaría si redujera un 5 % el precio de estas propiedades?", "agency.simulate_price", { percent: -5 }),
  A("¿Qué propiedades tienen precios similares y distinto nivel de interés?", "agency.similar_price"),
  A("Si quisiera promocionar tres propiedades esta semana, ¿cuáles elegirías y por qué?", "agency.promote", { count: 3, period: "week" }),

  // ── Variaciones, sinónimos y errores de tipeo ──────────────────────────────
  A("cuales son mis mejores propiedades", "agency.best"),
  A("cual tiene mas visitas", "agency.best"),
  A("que casas rinden peor", "agency.worst"),
  A("las propiedades que andan mal", "agency.worst"),
  A("tengo visitas pero nadie consulta", "agency.views_no_inquiries"),
  A("propeidades con muchas visitas y pocas consutlas", "agency.views_no_inquiries"),
  A("que tipo de propiedad funciona mejor", "agency.type_interest"),
  A("casas o departamentos cual rinde mas", "agency.type_interest"),
  A("que hago para tener mas consultas", "agency.actions"),
  A("dame ideas para vender mas", "agency.actions"),
  A("en cuales conviene subir fotos nuevas", "agency.photos"),
  A("que propiedades les faltan datos", "agency.incomplete"),
  A("que propiedades nadie consulta", "agency.stale_inquiries"),
  A("cuales estan estancadas", "agency.stale_inquiries"),
  A("que me estoy perdiendo", "agency.opportunities"),
  A("cuales de mis propiedades no tienen recorrido 360", "agency.opportunities"),
  A("que pasa si bajo el precio", "agency.simulate_price"),
  A("simula una baja de precio del 10%", "agency.simulate_price", { percent: -10 }),
  A("que pasa si subo 10% el precio", "agency.simulate_price", { percent: 10 }),
  A("cuales promociono esta semana", "agency.promote"),
  A("que cambie esta semana", "agency.activity", { period: "week" }),
  A("mis ultimos cambios", "agency.activity"),
  A("historial de cambios", "agency.activity"),
  A("desde que baje el precio de la casa de alan mejoraron las visitas?", "agency.change_impact", { propertyIds: ["p1"] }),
  A("sirvio el cambio que hice", "agency.change_impact"),
  A("funciono cambiar las fotos", "agency.change_impact"),
  A("como le va a la casa de alan", "agency.property_status", { propertyIds: ["p1"] }),
  A("que clientes tengo sin seguimiento", "agency.leads"),
  A("como va el embudo", "agency.leads"),
  A("dame un resumen", "agency.overview"),
  A("como me fue este mes", "agency.overview", { period: "month" }),
  A("panorama general", "agency.overview"),
  A("bajaron las visitas esta semana", "agency.changes_vs_previous"),
  A("crecio la visualizacion", "agency.changes_vs_previous"),
  A("que cambio desde la semana pasada", "agency.changes_vs_previous"),
  A("por que bajaron las visitas", "agency.investigate|agency.changes_vs_previous"),
  A("investigar por que", "agency.investigate"),
  A("en que zona me va mejor", "agency.compare_zones"),
  A("compara palermo con belgrano", "agency.compare_zones", { zones: ["Palermo", "Belgrano"] }),
  A("como me va en canning", "agency.compare_zones", { zones: ["Canning"] }),
  A("que propiedades vale la pena revisar", "agency.review_first"),
  A("por cual empiezo", "agency.review_first"),
  A("comparame las propiedades que mas consultas reciben con las que menos", "agency.traits"),
  A("cuantas visitas tuve esta semana", "agency.metric", { metric: "views", period: "week" }),
  A("cuantas consultas recibi este mes", "agency.metric", { metric: "inquiries", period: "month" }),
  A("cuantos favoritos tengo", "agency.metric", { metric: "saves" }),
  A("visitas de hoy", "agency.metric", { period: "today" }),
  A("cual es mi propiedad mas vista", "agency.best"),
  A("que propiedades no tienen video", "agency.opportunities"),
  A("mis casas de nordelta como van", "agency.compare_zones", { zones: ["Nordelta"], types: ["casa"] }),
  A("quiero ver las propiedades con menos visitas", "agency.worst"),
  A("hay alguna con muchos favoritos pero sin consultas", "agency.views_no_inquiries"),
  A("que tengo que hacer para vender la casa de canning", "agency.actions|agency.property_status"),
  A("como puedo conseguir mas visitas", "agency.actions"),
  A("que me aconsejas", "agency.actions"),
  A("cual es la conversion de mis propiedades", "agency.views_no_inquiries|agency.overview|clarify"),

  // ── Seguimientos con contexto ──────────────────────────────────────────────
  A("y en canning?", "agency.worst", { zones: ["Canning"] }, afterWorst),
  A("¿y el mes pasado?", "agency.changes_vs_previous", undefined, afterChanges),
  A("y las casas?", "agency.worst", { types: ["casa"] }, afterWorst),
  A("por que", "agency.investigate", undefined, afterWorst),
  A("que pasa con la primera", "agency.property_status|agency.investigate", { propertyIds: ["p1"] }, afterWorst),

  // ── Conversación ───────────────────────────────────────────────────────────
  A("hola", "common.greeting"),
  A("buen dia", "common.greeting"),
  A("gracias", "common.thanks"),
  A("que podes hacer", "common.help"),
  A("en que me podes ayudar", "common.help"),
  A("asdf qwerty", "unknown"),
  A("cual es la capital de francia", "unknown"),
  A("bla", "unknown"),

  // ── Explorador ─────────────────────────────────────────────────────────────
  E(
    "busco un departamento de 2 ambientes en Palermo hasta 120 mil dólares con cochera",
    "explorer.search",
    { types: ["departamento"], rooms: 2, zones: ["Palermo"], priceMax: { amount: 120000, currency: "USD" }, amenities: ["cochera"] }
  ),
  E("casas con pileta en Canning", "explorer.search", { types: ["casa"], zones: ["Canning"], amenities: ["pileta"] }),
  E("alquiler 3 ambientes belgrano", "explorer.search", { operation: "alquiler", rooms: 3, zones: ["Belgrano"] }),
  E("mostrame departamentos con cochera", "explorer.search", { types: ["departamento"], amenities: ["cochera"] }),
  E("quiero comprar una casa en nordelta", "explorer.search", { operation: "venta", types: ["casa"], zones: ["Nordelta"] }),
  E("dame casas baratas en nordelta", "explorer.search", { types: ["casa"], zones: ["Nordelta"] }),
  E("departamentos hasta 90000 usd", "explorer.search", { priceMax: { amount: 90000, currency: "USD" } }),
  E("monoambiente en caballito", "explorer.search", { zones: ["Caballito"] }),
  E("recomendame algo", "explorer.recommend"),
  E("que me recomendas", "explorer.recommend"),
  E("que propiedades bajaron de precio", "explorer.price_drops"),
  E("propiedades con descuento", "explorer.price_drops"),
  E("cuanto cuesta un departamento en belgrano", "explorer.price_typical", { zones: ["Belgrano"], types: ["departamento"] }),
  E("precio promedio de las casas en canning", "explorer.price_typical"),
  E("esta bien de precio esta propiedad", "explorer.price_check", undefined, { turn: 1, focusPropertyId: "p2" }),
  E("es cara", "explorer.price_check|unknown|clarify"),
  E("propiedades con recorrido 360", "explorer.with_tour"),
  E("quiero ver casas con tour virtual", "explorer.with_tour"),
  E("que hay de nuevo", "explorer.new"),
  E("propiedades recien publicadas", "explorer.new"),
  E("las mas populares", "explorer.popular"),
  E("que es lo mas buscado", "explorer.popular"),
  E("que inmobiliarias hay en tigre", "explorer.agencies", { zones: ["Tigre"] }),
  E("compara las dos primeras", "explorer.compare", undefined, afterSearch),
  E("hola", "common.greeting"),
  E("que podes hacer", "common.help"),
  E("y en palermo?", "explorer.search", { zones: ["Palermo"] }, afterSearch),
  E("busco una casa con pileta y quincho en tigre", "explorer.search", { types: ["casa"], zones: ["Tigre"] }),
  E("cuanto sale alquilar un 2 ambientes en belgrano", "explorer.price_typical|explorer.search", { zones: ["Belgrano"], rooms: 2 }),
  E("hay departamentos con recorrido virtual en palermo", "explorer.with_tour|explorer.search", { zones: ["Palermo"] }),
  E("inmobiliarias en nordelta", "explorer.agencies", { zones: ["Nordelta"] }),
  E("las propiedades mas vistas", "explorer.popular"),
  E("recien publicadas en tigre", "explorer.new", { zones: ["Tigre"] }),
  E("gracias", "common.thanks"),
  E("cual es la mejor pizzeria", "unknown"),

  // ── Portada viva ("portada" sola es sinónimo de foto; "ambientada" se parece a "ambiente") ──
  A("que propiedades tienen portada viva", "agency.ambient_cover", { field: "ambient" }),
  A("cuales no tienen portada reactiva", "agency.ambient_cover", { field: "ambient" }),
  A("que es la portada viva", "agency.ambient_cover"),
  A("me conviene usar portada animada", "agency.ambient_cover"),
  A("tengo alguna propiedad con ambientacion dia y noche", "agency.ambient_cover"),
  A("sirvio agregar la portada viva", "agency.change_impact", { field: "ambient" }),
  A("desde que puse la portada viva mejoraron las visitas", "agency.change_impact", { field: "ambient" }),
  A("funciono poner portada reactiva en la casa de alan", "agency.change_impact", { field: "ambient" }),
  A("cuales necesitan mejores fotos de portada", "agency.photos"), // sigue siendo de fotos
  A("que propiedades tienen pocas fotos", "agency.photos"),
  A("que propiedades tienen 3 ambientes", "unknown|clarify|agency.metric|agency.property_status"), // "ambientes" no es portada viva
  E("propiedades con portada viva", "explorer.with_ambient"),
  E("quiero ver casas con portada animada", "explorer.with_ambient"),
  E("mostrame las que tienen portada reactiva en palermo", "explorer.with_ambient|explorer.search", { zones: ["Palermo"] }),
  E("hay casas que se vean de dia y de noche", "explorer.with_ambient|explorer.search"),
  E("departamento de 2 ambientes en palermo", "explorer.search", { rooms: 2, zones: ["Palermo"] }), // no se confunde con "ambientacion"

  // ── "Preguntale al asesor" desde la ficha (explorer.about_property) ────────
  E("contame de esta propiedad", "explorer.about_property", { propertyIds: ["p2"] }, focusP2),
  E("me conviene esta casa", "explorer.about_property", { propertyIds: ["p2"] }, focusP2),
  E("que opinas de esta", "explorer.about_property", undefined, focusP2),
  E("describime esta propiedad", "explorer.about_property", undefined, focusP2),
  E("me la recomendas", "explorer.about_property", undefined, focusP2),
  E("que tal es esta", "explorer.about_property", undefined, focusP2),
  E("describime la primera", "explorer.about_property", { propertyIds: ["p2"] }, afterSearch),
  E("contame de la casa de alan", "explorer.about_property|explorer.search|explorer.recommend|unknown|clarify"), // el explorador no ve títulos
  // Regresiones: lo que ya andaba no cambia.
  E("recomendame algo", "explorer.recommend"),
  E("recomendame algo", "explorer.recommend", undefined, focusP2), // con ficha abierta pero sin pedir opinión de ella
  E("que me recomendas", "explorer.recommend"),
  E("esta bien de precio esta propiedad", "explorer.price_check", undefined, focusP2),
  E("esta cara esta propiedad", "explorer.price_check", undefined, focusP2),
  E("cuanto cuesta un departamento en palermo", "explorer.price_typical", { zones: ["Palermo"] }),
  E("compara las primeras", "explorer.compare", undefined, afterSearch),
  E("busco una casa en canning", "explorer.search", { zones: ["Canning"] }),
  // Sin propiedad de la que hablar, pedir "opinión" no activa la intención nueva.
  E("que opinas", "unknown|clarify|explorer.recommend|common.help"),
  // Una inmobiliaria (modo agency) no tiene esta intención.
  A("contame de esta propiedad", "unknown|clarify|agency.property_status|agency.investigate|agency.overview", undefined, focusP2),
];

function matches(actual: string, expected: string): boolean {
  return expected.split("|").some((e) => e === actual);
}

function sameSlot(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

let failed = 0;
for (const c of CASES) {
  const u = understand(c.q, c.mode ?? "agency", index, c.ctx);
  const got = u.kind === "intent" ? u.intent : u.kind;
  const okIntent = matches(got, c.expect);
  const wrongSlots: string[] = [];
  if (okIntent && c.slots) {
    for (const [key, want] of Object.entries(c.slots)) {
      const have = (u.slots as Record<string, unknown>)[key];
      if (!sameSlot(have, want)) wrongSlots.push(`${key}: esperado ${JSON.stringify(want)}, obtenido ${JSON.stringify(have)}`);
    }
  }
  const ok = okIntent && wrongSlots.length === 0;
  if (!ok) {
    failed++;
    const alts = u.alternatives.map((a) => `${a.intent}=${a.score.toFixed(1)}`).join(", ");
    console.log(`✗ [${c.mode}] ${c.q}\n    esperado: ${c.expect}   obtenido: ${got}   (${alts})`);
    for (const w of wrongSlots) console.log(`    slot ${w}`);
  }
}

// ── Lo que el admin le enseña: sólo suma ─────────────────────────────────────
let extra = 0;
function expectThat(name: string, ok: boolean, detail?: unknown) {
  extra++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${JSON.stringify(detail)}` : ""}`);
  }
}
const teach = (pairs: [string, string][]): TaughtExamples => {
  const map = new Map<string, Set<string>[]>();
  for (const [intent, phrase] of pairs) map.set(intent, [...(map.get(intent) ?? []), stemSet(phrase)]);
  return map;
};
const outcome = (q: string, mode: AdvisorMode, ctx?: AdvisorContext, taught?: TaughtExamples) => {
  const u = understand(q, mode, index, ctx, taught);
  return u.kind === "intent" ? u.intent : u.kind;
};
{
  const base = outcome("decime algo copado de mi negocio", "agency");
  expectThat("lecciones: sin enseñarle, una frase rara no se entiende", base === "unknown" || base === "clarify", base);
  const taught = teach([["agency.overview", "decime algo copado de mi negocio"]]);
  expectThat("lecciones: la frase enseñada se entiende", outcome("decime algo copado de mi negocio", "agency", undefined, taught) === "agency.overview");
  expectThat("lecciones: una variante muy parecida también", outcome("decime algo muy copado sobre mi negocio", "agency", undefined, taught) === "agency.overview", outcome("decime algo muy copado sobre mi negocio", "agency", undefined, taught));
  expectThat("lecciones: una frase distinta no se contagia", outcome("cuanto cuesta un departamento en palermo", "explorer", undefined, taught) === "explorer.price_typical");
  expectThat("lecciones: lo enseñado a una intención no la activa en el otro modo", outcome("decime algo copado de mi negocio", "explorer", undefined, taught) !== "agency.overview");
  const nothing = teach([]);
  expectThat("lecciones: sin lecciones todo sigue igual", outcome("que casas rinden peor", "agency", undefined, nothing) === "agency.worst");

  // Lecciones absurdas o mal puestas no cambian NADA de lo que ya entendía (todas las preguntas conocidas de arriba dan lo mismo).
  const absurd = teach([
    ["agency.best", "asdf qwer zxcv"],
    ["agency.worst", "hola buen dia como estas"],
    ["explorer.new", "gracias por todo"],
    ["agency.leads", "quien sabe que sera"],
    ["explorer.popular", "una frase que nadie va a decir nunca jamas"],
  ]);
  const changed = CASES.filter((c) => outcome(c.q, c.mode ?? "agency", c.ctx) !== outcome(c.q, c.mode ?? "agency", c.ctx, absurd)).map((c) => c.q);
  expectThat("lecciones: lecciones sin relación no cambian ninguna de las preguntas conocidas", changed.length === 0, changed);
  // Un parecido flojo no alcanza: hace falta un parecido alto para que cuente.
  const vague = teach([["agency.best", "las propiedades que mejor funcionan en mis zonas favoritas del mes pasado"]]);
  expectThat("lecciones: un parecido flojo no cuenta", outcome("que casas rinden peor", "agency", undefined, vague) === "agency.worst");
}

console.log(`\n${CASES.length + extra - failed}/${CASES.length + extra} casos correctos`);
process.exit(failed > 0 ? 1 : 0);
