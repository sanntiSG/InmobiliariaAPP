/**
 * Pruebas de la lógica compartida de los agentes — sin base de datos ni red.
 * Correr con `npm run agents:check`: sale con código 1 si alguna falla.
 */
import { describeLine, factItems, firstSentences, highlights, priceText, type PropertyFacts } from "../src/lib/agents/knowledge/facts";
import { matchPreferences, type PrefProperty } from "../src/lib/agents/knowledge/preferences";
import { isFreeIntent } from "../src/lib/advisor/types";
import { normalizeContent, toPublicConfig } from "../src/lib/advisor/config";
import { promotionNote, rankForPromotion, type PromotionRow } from "../src/lib/agents/knowledge/promote";
import { interestBand, interestText, perHundred } from "../src/config/glossary";
import { buildTodayList } from "../src/lib/intelligence/today";
import type { Diagnostic } from "../src/lib/intelligence/diagnostics";
import type { Benchmarks } from "../src/lib/intelligence/benchmarks";
import { emptyTotals } from "../src/lib/intelligence/metrics";
import { buildCaption, captionToString, hashtagify } from "../src/lib/social/caption";
import { buildPostData } from "../src/lib/social/content";
import { TEMPLATE_META } from "../src/lib/social/template-meta";
import { TEMPLATE_COUNT } from "../src/lib/social/templates";
import { AGENTS, AGENT_IDS, agentsForAudience, audienceOf, isAgentId } from "../src/lib/agents/registry";
import type { TasteProfileData } from "../src/lib/intelligence/user-profile";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${JSON.stringify(detail)}` : ""}`);
  }
}

const base: PrefProperty = {
  operation: "venta",
  type: "casa",
  neighborhood: "Palermo",
  city: "CABA",
  price: { amount: 150_000, currency: "USD" },
  rooms: 4,
  bedrooms: 3,
  amenities: ["cochera", "pileta"],
};

const emptyTaste = (over: Partial<TasteProfileData> = {}): TasteProfileData => ({
  sampleSize: 0,
  totalWeight: 0,
  neighborhoods: [],
  types: [],
  operations: [],
  amenities: [],
  prices: [],
  bedrooms: null,
  area: null,
  centroids: [],
  savedCount: 0,
  ...over,
});

// ── matchPreferences: preferencias guardadas ────────────────────────────────
{
  const none = matchPreferences(base, null, null);
  check("sin preferencias ni actividad → none/unknown", none.source === "none" && none.verdict === "unknown" && none.ratio === null, none);

  const empty = matchPreferences(base, { operations: [], propertyTypes: [], locations: [] }, emptyTaste());
  check("preferencias vacías → none", empty.source === "none", empty);

  const all = matchPreferences(
    base,
    { operations: ["venta"], propertyTypes: ["casa"], locations: ["Palermo"], priceMin: 100_000, priceMax: 200_000, priceCurrency: "USD", minRooms: 3 },
    null
  );
  check("todo coincide → yes", all.verdict === "yes" && all.source === "explicit" && all.criteria.every((c) => c.result === "match"), all);

  const wrongOp = matchPreferences(base, { operations: ["alquiler"], propertyTypes: ["casa"], locations: ["Palermo"] }, null);
  check("operación distinta (criterio duro) → no aunque lo demás coincida", wrongOp.verdict === "no", wrongOp);

  const slightlyOver = matchPreferences(
    base,
    { operations: ["venta"], propertyTypes: ["casa"], locations: ["Palermo"], priceMax: 139_000, priceCurrency: "USD" },
    null
  );
  const priceNear = slightlyOver.criteria.find((c) => c.key === "price");
  check("precio 8 % arriba del tope → near (no miss)", priceNear?.result === "near" && /8 %/.test(priceNear.text), priceNear);
  check("precio apenas arriba y todo lo demás coincide → yes", slightlyOver.verdict === "yes", slightlyOver);

  const farOver = matchPreferences(
    base,
    { operations: ["venta"], propertyTypes: ["casa"], locations: ["Palermo"], priceMax: 100_000, priceCurrency: "USD" },
    null
  );
  check("precio 50 % arriba del tope → miss y el veredicto baja a maybe", farOver.criteria.find((c) => c.key === "price")?.result === "miss" && farOver.verdict === "maybe", farOver);

  const mixedCurrency = matchPreferences(
    base,
    { operations: ["venta"], propertyTypes: ["casa"], priceMax: 5_000_000, priceCurrency: "ARS" },
    null
  );
  const mixed = mixedCurrency.criteria.find((c) => c.key === "price");
  check("rango en otra moneda → unknown (no se mezcla)", mixed?.result === "unknown" && /no lo mezclé/.test(mixed.text), mixed);
  check("…y no pesa en el puntaje", mixedCurrency.verdict === "yes", mixedCurrency);

  const noCurrency = matchPreferences(base, { operations: ["venta", "alquiler"], priceMax: 100_000 }, null);
  check("rango sin moneda y con operaciones mezcladas → unknown", noCurrency.criteria.find((c) => c.key === "price")?.result === "unknown", noCurrency);

  const inferred = matchPreferences(base, { operations: ["venta"], priceMax: 200_000 }, null);
  check("rango sin moneda buscando sólo venta → se asume USD", inferred.criteria.find((c) => c.key === "price")?.result === "match", inferred);

  const rooms4 = matchPreferences(base, { operations: ["venta"], minRooms: 4 }, null);
  check("ambientes mínimos se compara con ambientes (4 ≥ 4), no con dormitorios (3)", rooms4.criteria.find((c) => c.key === "rooms")?.result === "match", rooms4);
  const rooms5 = matchPreferences(base, { operations: ["venta"], minRooms: 5 }, null);
  check("un ambiente menos → near", rooms5.criteria.find((c) => c.key === "rooms")?.result === "near", rooms5);
  const roomsFallback = matchPreferences({ ...base, rooms: null }, { operations: ["venta"], minRooms: 4 }, null);
  check("sin ambientes cargados usa dormitorios + 1", roomsFallback.criteria.find((c) => c.key === "rooms")?.result === "match", roomsFallback);

  const accent = matchPreferences({ ...base, neighborhood: "Núñez" }, { operations: ["venta"], locations: ["nunez"] }, null);
  check("zona sin tildes ni mayúsculas coincide", accent.criteria.find((c) => c.key === "location")?.result === "match", accent);

  const justOne = matchPreferences(base, { locations: ["Palermo"] }, null);
  check("un solo criterio evaluable → unknown", justOne.verdict === "unknown", justOne);

  const amen = matchPreferences(base, { operations: ["venta"], amenities: ["pileta", "gimnasio"] }, null);
  const amenResults = amen.criteria.filter((c) => c.key === "amenity").map((c) => c.result);
  check("comodidades: una la tiene y otra no", amenResults.join() === "match,miss", amen);
}

// ── matchPreferences: lo que viene mirando ──────────────────────────────────
{
  const taste = emptyTaste({
    sampleSize: 8,
    operations: [{ key: "venta", weight: 0.9 }],
    neighborhoods: [{ key: "Palermo", weight: 0.6 }],
    types: [{ key: "casa", weight: 0.7 }],
    prices: [{ key: "venta:USD", median: 140_000, low: 120_000, high: 170_000 }],
  });
  const fit = matchPreferences(base, null, taste);
  check("sin preferencias pero con actividad → source taste", fit.source === "taste", fit);
  check("lo que viene mirando coincide → yes", fit.verdict === "yes", fit);

  const other = matchPreferences({ ...base, operation: "alquiler", neighborhood: "Tigre", type: "departamento", price: { amount: 500_000, currency: "ARS" } }, null, taste);
  check("todo distinto de lo que mira → no", other.verdict === "no", other);

  const few = matchPreferences(base, null, emptyTaste({ sampleSize: 3, operations: [{ key: "venta", weight: 1 }] }));
  check("actividad insuficiente (< 5) → none", few.source === "none", few);

  const explicitWins = matchPreferences(base, { operations: ["alquiler"] , propertyTypes: ["casa"] }, taste);
  check("las preferencias guardadas ganan sobre la actividad", explicitWins.source === "explicit", explicitWins);
}

// ── Datos de la propiedad ───────────────────────────────────────────────────
{
  const facts: PropertyFacts = {
    id: "a".repeat(24),
    slug: "casa-en-palermo",
    title: "Casa en Palermo",
    description: "Casa luminosa con jardín. Cerca del subte. Muy buen estado.",
    type: "casa",
    operation: "venta",
    price: { amount: 175_000, currency: "USD", expenses: 0, period: "total" },
    neighborhood: "Palermo",
    city: "CABA",
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    garages: 1,
    coveredArea: 198,
    totalArea: 238,
    age: 12,
    floor: null,
    orientation: null,
    amenities: ["cochera", "pileta"],
    hasTour: true,
    hasAmbient: false,
    videoCount: 0,
  };
  const line = describeLine(facts);
  check("describeLine: artículo, tipo, operación y zona", /^Es una casa en venta en Palermo, CABA/.test(line), line);
  check("describeLine: incluye ambientes, superficie cubierta y precio", /4 ambientes/.test(line) && /198 m² cubiertos/.test(line) && /175\.000/.test(line), line);
  const flat = describeLine({ ...facts, type: "departamento", operation: "alquiler", price: { amount: 850_000, currency: "ARS", expenses: 120_000, period: "mensual" } });
  check("describeLine: alquiler con 'por mes' y expensas", /Es un departamento en alquiler/.test(flat) && /por mes/.test(flat) && /expensas/.test(flat), flat);
  check("priceText: venta sin 'por mes'", !/por mes/.test(priceText(facts)), priceText(facts));
  const items = factItems(facts);
  check("factItems: sin expensas ni piso si no hay", !items.some((i) => i.icon === "expenses" || i.icon === "floor"), items.map((i) => i.icon));
  check("factItems: cochera, antigüedad y recorrido presentes", ["garage", "age", "tour"].every((k) => items.some((i) => i.icon === k)), items.map((i) => i.icon));
  check("highlights: cochera primero y recorrido", highlights(facts)[0] === "cochera" && highlights(facts).includes("recorrido 360°"), highlights(facts));
  check("firstSentences: junta oraciones cortas hasta ~40 caracteres", firstSentences(facts.description) === "Casa luminosa con jardín. Cerca del subte.", firstSentences(facts.description));
  check("firstSentences: una oración larga se corta con tope", firstSentences("a".repeat(300), 100).length <= 100);
  check("firstSentences: texto vacío → vacío", firstSentences("   ") === "");
}

// ── Intenciones gratuitas ───────────────────────────────────────────────────
check("about_property no gasta el cupo", isFreeIntent("explorer.about_property"));
check("recommend sí lo gasta", !isFreeIntent("explorer.recommend"));

// ── Registro de agentes ─────────────────────────────────────────────────────
{
  check("el asesor conserva la clave 'default' (sin migrar datos)", AGENTS.advisor.storageKey === "default");
  check("las claves de almacenamiento no se repiten", new Set(AGENT_IDS.map((id) => AGENTS[id].storageKey)).size === AGENT_IDS.length);
  check("isAgentId acepta los tres y rechaza el resto", AGENT_IDS.every(isAgentId) && !isAgentId("admin") && !isAgentId("") && !isAgentId(null) && !isAgentId({}));

  const admin = audienceOf({ role: "admin", agencyId: null });
  const owner = audienceOf({ role: "agency_owner", agencyId: "x" });
  const agent = audienceOf({ role: "agency_agent", agencyId: "x" });
  const ownerNoAgency = audienceOf({ role: "agency_owner", agencyId: null });
  const user = audienceOf({ role: "user", agencyId: null });
  const anon = audienceOf({ role: null, agencyId: null });
  check("admin y gente con inmobiliaria → agency", admin === "agency" && owner === "agency" && agent === "agency");
  check("dueño sin inmobiliaria creada, usuario y visitante → explorer", ownerNoAgency === "explorer" && user === "explorer" && anon === "explorer");
  check("explorador ve sólo al asesor", agentsForAudience("explorer").join() === "advisor", agentsForAudience("explorer"));
  check("inmobiliaria ve los tres, con el asesor primero", agentsForAudience("agency").join() === "advisor,marketing,mail", agentsForAudience("agency"));
}

// ── Contenido por agente ────────────────────────────────────────────────────
{
  const adv = normalizeContent({});
  check("asesor: nace encendido para ambos públicos (como siempre)", adv.enabled.agency && adv.enabled.explorer, adv.enabled);
  const advOff = normalizeContent({ enabled: { agency: false, explorer: true } });
  check("asesor: se puede apagar un público", !advOff.enabled.agency && advOff.enabled.explorer, advOff.enabled);

  for (const id of ["marketing", "mail"] as const) {
    const fresh = normalizeContent({}, id);
    check(`${id}: nace APAGADO`, !fresh.enabled.agency && !fresh.enabled.explorer, fresh.enabled);
    check(`${id}: sin nombre y con su descripción`, fresh.name === "" && fresh.description === AGENTS[id].defaultDescription, fresh);
    const on = normalizeContent({ enabled: { agency: true, explorer: true } }, id);
    check(`${id}: se enciende para inmobiliarias y nunca para exploradores`, on.enabled.agency && !on.enabled.explorer, on.enabled);
    check(`${id}: "enabled" con basura no lo enciende`, !normalizeContent({ enabled: { agency: "yes" } }, id).enabled.agency);
    check(`${id}: usa el modelo incluido por defecto (mismo GLB que el asesor)`, fresh.model.url === adv.model.url, fresh.model);
  }

  const pub = toPublicConfig(normalizeContent({}, "marketing"), "marketing");
  check("público sin nombre: se muestra el rol", pub.displayName === "Marketing" && pub.roleLabel === "Marketing" && pub.id === "marketing", pub);
  check("público sin nombre: 'Preguntale al agente de marketing'", pub.ctaTo === "al agente de marketing", pub.ctaTo);
  const named = toPublicConfig(normalizeContent({ name: "Lupe" }, "marketing"), "marketing");
  check("público con nombre: usa el nombre", named.displayName === "Lupe" && named.ctaTo === "a Lupe", named);
  const defaultPub = toPublicConfig(normalizeContent({}));
  check("sin indicar agente sigue siendo el asesor", defaultPub.id === "advisor" && defaultPub.ctaTo === "al asesor" && defaultPub.displayName === "Asesor", defaultPub);
}

// ── Texto y hashtags de las publicaciones ───────────────────────────────────
{
  check("hashtagify: CamelCase y sin espacios", hashtagify("Villa Urquiza") === "#VillaUrquiza", hashtagify("Villa Urquiza"));
  check("hashtagify: sin tildes ni ñ", hashtagify("Núñez") === "#Nunez" && hashtagify("Cañuelas") === "#Canuelas", [hashtagify("Núñez"), hashtagify("Cañuelas")]);
  check("hashtagify: respeta las siglas cortas", hashtagify("CABA") === "#CABA" && hashtagify("PH") === "#PH" && hashtagify("Gran Buenos Aires") === "#GranBuenosAires");
  check("hashtagify: vacío y sólo números → null", hashtagify("  ") === null && hashtagify("123") === null);
  check("hashtagify: tope de largo", (hashtagify("a".repeat(80))?.length ?? 99) <= 31);

  const capFacts: PropertyFacts = {
    id: "b".repeat(24),
    slug: "casa-en-palermo",
    title: "Casa en Palermo",
    description: "Casa luminosa con jardín.",
    type: "casa",
    operation: "venta",
    price: { amount: 175_000, currency: "USD", expenses: 0, period: "total" },
    neighborhood: "Núñez",
    city: "CABA",
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    garages: 1,
    coveredArea: 198,
    totalArea: 238,
    amenities: ["cochera", "pileta"],
    hasTour: true,
    hasAmbient: false,
    videoCount: 0,
  };
  const input = { agencyName: "Umbral Norte Propiedades", seed: "v1", url: "https://recorrr.example/propiedades/casa-en-palermo" };
  const cap = buildCaption(capFacts, input);
  check("caption: es determinista con la misma semilla", JSON.stringify(cap) === JSON.stringify(buildCaption(capFacts, input)));
  const variants = new Set(Array.from({ length: 12 }, (_, i) => buildCaption(capFacts, { ...input, seed: `v${i}` }).text));
  check("caption: cambia con la semilla (regenerar también cambia el texto)", variants.size >= 2, variants.size);
  check("caption: trae el precio, la zona, el enlace y la inmobiliaria", /175\.000/.test(cap.text) && /Núñez/.test(cap.text) && cap.text.includes(input.url) && cap.text.includes(input.agencyName), cap.text);
  check("caption: sin emojis", !/\p{Extended_Pictographic}/u.test(cap.text + cap.hashtags.join("")), cap.text);
  check("caption: sin enlace no lo menciona", !/Más fotos y datos/.test(buildCaption(capFacts, { ...input, url: null }).text));
  check("hashtags: entre 5 y 12, sin repetir y bien formados", cap.hashtags.length >= 5 && cap.hashtags.length <= 12 && new Set(cap.hashtags.map((h) => h.toLowerCase())).size === cap.hashtags.length && cap.hashtags.every((h) => /^#[A-Za-z0-9]{1,30}$/.test(h)), cap.hashtags);
  check("hashtags: zona sin tildes, recorrido 360° y cochera", cap.hashtags.includes("#Nunez") && cap.hashtags.includes("#Recorrido360") && cap.hashtags.includes("#Cochera"), cap.hashtags);
  const rent = buildCaption({ ...capFacts, operation: "alquiler", price: { amount: 850_000, currency: "ARS", period: "mensual" } }, input);
  check("caption: alquiler habla de alquiler y 'por mes'", /lquil/.test(rent.text) && /por mes/.test(rent.text), rent.text);
  check("captionToString junta texto y hashtags", captionToString(cap).endsWith(cap.hashtags.join(" ")));
  check("hashtags: 'en venta' queda en CamelCase", cap.hashtags.includes("#CasaEnVenta"), cap.hashtags);
  const office = Array.from({ length: 12 }, (_, i) => buildCaption({ ...capFacts, type: "oficina", city: "Rosario", neighborhood: null }, { ...input, seed: `o${i}` }).text).join("\n");
  check("caption: una oficina nunca 'es para vivir' ni 'mudarse'", !/vivir|hogar|Mudate/.test(office), office.slice(0, 300));
}

// ── Qué promocionar ─────────────────────────────────────────────────────────
{
  const bench: Benchmarks = { platform: { n: 0, inquiryRate: null, saveRate: null, medianViews30: null, medianDwellSec: null }, byKey: {} };
  const row = (over: Partial<PromotionRow> & { id: string }): PromotionRow => ({
    type: "casa",
    operation: "venta",
    score: 50,
    d30: { ...emptyTotals(), views: 40 },
    w7: emptyTotals(),
    p7: emptyTotals(),
    hasTour: false,
    videos: 0,
    hasAmbientCover: false,
    publishedAt: null,
    images: 6,
    descriptionLength: 200,
    diagnostics: [],
    ...over,
  });
  const now = new Date("2026-10-25T12:00:00Z");
  const plain = row({ id: "plain" });
  const tour = row({ id: "tour", hasTour: true });
  const ranked = rankForPromotion([plain, tour], bench, now);
  check("promover: con recorrido 360° gana a una igual sin él", ranked[0]!.r.id === "tour" && ranked[0]!.reasons.some((x) => /360/.test(x)), ranked.map((x) => [x.r.id, x.score]));
  const few = rankForPromotion([row({ id: "few", images: 2 })], bench, now)[0]!;
  check("promover: con menos de 3 fotos queda bloqueada", few.blocked);
  const grave = rankForPromotion([row({ id: "grave", diagnostics: [{ id: "x", kind: "attention", severity: "high", title: "t", explanation: "e", action: "a", href: "/", evidence: [] }] })], bench, now)[0]!;
  check("promover: con un problema grave pendiente queda bloqueada", grave.blocked);
  const again = rankForPromotion([plain, row({ id: "twin" })], bench, now, { promotedDaysAgo: new Map([["plain", 1]]) });
  check("promover: la que se promocionó hace poco baja", again[0]!.r.id === "twin", again.map((x) => [x.r.id, x.score]));
  const rising = rankForPromotion([row({ id: "up", w7: { ...emptyTotals(), views: 40 }, p7: { ...emptyTotals(), views: 10 } })], bench, now)[0]!;
  check("promover: dice cuánto crecieron las visitas", rising.reasons.some((x) => /crecieron \+?300 %/.test(x)), rising.reasons);
  check("promotionNote: arma la frase con mayúscula y punto", promotionNote(["recibe interés sostenido", "tiene recorrido 360°"]) === "Recibe interés sostenido y tiene recorrido 360°.", promotionNote(["recibe interés sostenido", "tiene recorrido 360°"]));
  check("promotionNote: sin motivos sigue diciendo algo útil", promotionNote([]).length > 10);
}

// ── Diseños y datos del posteo ──────────────────────────────────────────────
{
  check("hay un nombre por cada diseño, en el mismo orden", TEMPLATE_META.length === TEMPLATE_COUNT && TEMPLATE_META.every((t, i) => t.id === i && t.name.length > 0), TEMPLATE_META.length);
  const agency = { name: "Umbral", logo: null, branding: null };
  const suffix = (operation: string, period?: string) => buildPostData({ type: "casa", operation, price: { amount: 100, currency: "ARS", period } }, agency, "data:x", null).priceSuffix;
  check("sufijo: alquiler → /mes", suffix("alquiler", "mensual") === "/mes" && suffix("alquiler", "total") === "/mes");
  check("sufijo: venta → nada", suffix("venta", "total") === "");
  check("sufijo: alquiler temporal por estadía → nada; mensual → /mes", suffix("alquiler_temporal", "total") === "" && suffix("alquiler_temporal", "mensual") === "/mes");
}

// ── Lenguaje simple y "qué hacer hoy" del panel ─────────────────────────────
{
  check("interés: bandas alto / medio / bajo", interestBand(5) === "bajo" && interestBand(30) === "medio" && interestBand(119) === "medio" && interestBand(120) === "alto");
  check("interés: se lee 'Interés alto', sin 'pts'", interestText(200) === "Interés alto" && !/pts/.test(interestText(10)));
  check("perHundred: cuenta como se habla", perHundred(0.05) === "5 de cada 100" && perHundred(0.034) === "3,4 de cada 100" && perHundred(0.5) === "50 de cada 100", [perHundred(0.05), perHundred(0.034), perHundred(0.5)]);
  check("perHundred: sin dato → null", perHundred(null) === null && perHundred(Number.NaN) === null);

  const diag = (id: string, kind: Diagnostic["kind"], severity: Diagnostic["severity"], over: Partial<Diagnostic> = {}): Diagnostic => ({
    id,
    kind,
    severity,
    title: `Hallazgo ${id}`,
    explanation: "Qué pasa.",
    action: "Qué hacer.",
    href: "/dashboard/propiedades",
    evidence: [],
    ...over,
  });
  const many = [
    diag("no-tour:a", "opportunity", "medium", { propertyId: "a", propertyTitle: "Casa A" }),
    diag("no-tour:b", "opportunity", "medium", { propertyId: "b", propertyTitle: "Casa B" }),
    diag("no-tour:c", "opportunity", "medium", { propertyId: "c", propertyTitle: "Casa C" }),
    diag("low-views:d", "attention", "high", { propertyId: "d", propertyTitle: "Casa D" }),
    diag("good:e", "positive", "low", { propertyId: "e" }),
    diag("few-photos:f", "attention", "medium", { propertyId: "f" }),
    diag("no-video:g", "opportunity", "low", { propertyId: "g" }),
    diag("no-desc:h", "opportunity", "low", { propertyId: "h" }),
  ];
  const list = buildTodayList({ opportunities: many, staleClients: 4 });
  check("hoy: máximo 5 y sin repetidos", list.length === 5 && new Set(list.map((i) => i.id)).size === 5, list.map((i) => i.id));
  check("hoy: los clientes sin seguimiento van primero (urgente con 3 o más)", list[0]!.id === "stale-clients" && list[0]!.severity === "high" && /4 clientes/.test(list[0]!.title), list[0]);
  check("hoy: lo que va bien no es una tarea", !list.some((i) => i.id.startsWith("good")));
  check("hoy: tres propiedades sin 360° son UNA sola acción", list.filter((i) => /no-tour/.test(i.id)).length === 1 && list.some((i) => /3 propiedades/.test(i.title)), list.map((i) => i.title));
  check("hoy: el problema grave va antes que las oportunidades", list.findIndex((i) => i.id.startsWith("low-views")) < list.findIndex((i) => /no-tour/.test(i.id)), list.map((i) => i.id));
  const one = buildTodayList({ opportunities: [], staleClients: 1 });
  check("hoy: un cliente → singular y no urgente", one.length === 1 && /1 cliente sin seguimiento/.test(one[0]!.title) && one[0]!.severity === "medium", one);
  check("hoy: sin nada pendiente → lista vacía", buildTodayList({ opportunities: [many[4]!], staleClients: 0 }).length === 0);
  check("hoy: lleva al diagnóstico de la propiedad cuando es una sola", list.find((i) => i.id.startsWith("low-views"))?.href === "/dashboard/propiedades/d/estadisticas");
}

console.log(`\n${total - failed}/${total} pruebas correctas`);
process.exit(failed > 0 ? 1 : 0);
