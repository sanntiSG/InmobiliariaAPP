/**
 * Pruebas de la lógica compartida de los agentes — sin base de datos ni red.
 * Correr con `npm run agents:check`: sale con código 1 si alguna falla.
 */
import { describeLine, factItems, firstSentences, highlights, priceText, type PropertyFacts } from "../src/lib/agents/knowledge/facts";
import { matchPreferences, type PrefProperty } from "../src/lib/agents/knowledge/preferences";
import { isFreeIntent } from "../src/lib/advisor/types";
import { normalizeContent, toPublicConfig } from "../src/lib/advisor/config";
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

console.log(`\n${total - failed}/${total} pruebas correctas`);
process.exit(failed > 0 ? 1 : 0);
