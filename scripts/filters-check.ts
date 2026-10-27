/**
 * Pruebas de los filtros de propiedades (mapa y listado) — sin base de datos: el estado, su ida y vuelta por la dirección, las
 * etiquetas que se pueden quitar, la validación de los parámetros y el filtro de Mongo que se arma. Correr con
 * `npm run filters:check`: sale con código 1 si alguna falla.
 */
import { DEFAULT_FILTERS, RECENT_DAYS, activeChips, countActiveFilters, filtersEqual, filtersToSearchParams, parseFilters, type PropertyFiltersState } from "../src/lib/filters/state";
import { buildPropertyQuery } from "../src/lib/db/property-query";
import { listFiltersSchema, mapFiltersSchema } from "../src/lib/validation/filters";
import { areaBounds, niceCeil, niceStep, priceBounds } from "../src/lib/filters/bounds";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${JSON.stringify(detail)}` : ""}`);
  }
}

const full: PropertyFiltersState = {
  q: "palermo",
  operation: "alquiler",
  types: ["casa", "ph"],
  currency: "ARS",
  priceMin: 150000,
  priceMax: 900000,
  minRooms: 3,
  minBedrooms: 2,
  minBathrooms: 1,
  minGarages: 1,
  areaMin: 60,
  areaMax: 200,
  amenities: ["pileta", "cochera"],
  city: "CABA",
  neighborhood: "Palermo",
  tour3dOnly: true,
  ambientOnly: true,
  videoOnly: true,
  recentOnly: true,
  agencyId: "a".repeat(24),
};

// ── Estado y dirección ──────────────────────────────────────────────────────
{
  check("sin filtros no hay parámetros", filtersToSearchParams(DEFAULT_FILTERS).toString() === "");
  const qs = filtersToSearchParams(full);
  const back = parseFilters(qs);
  check("ida y vuelta: todos los filtros sobreviven a la dirección", JSON.stringify(back) === JSON.stringify(full), { qs: qs.toString(), back });
  check("ida y vuelta: sin filtros vuelve a lo mismo", JSON.stringify(parseFilters(new URLSearchParams())) === JSON.stringify(DEFAULT_FILTERS));
  check("filtersEqual compara por lo que se manda", filtersEqual(full, parseFilters(filtersToSearchParams(full))) && !filtersEqual(full, DEFAULT_FILTERS));
  const record = parseFilters({ operation: "venta", type: ["casa", "ph"], priceMax: "120000", currency: "USD" });
  check("parseFilters acepta el objeto de searchParams de Next (los arreglos toman el primero)", record.operation === "venta" && record.types.join() === "casa" && record.priceMax === 120000 && record.currency === "USD", record);
  check("la inmobiliaria se lee de agencyId o de agency (el botón 'Ver en mapa' del perfil)", parseFilters({ agency: "b".repeat(24) }).agencyId === "b".repeat(24) && parseFilters({ agencyId: "c".repeat(24) }).agencyId === "c".repeat(24));
}

// ── Una dirección rota o armada a mano nunca rompe nada ─────────────────────
{
  const junk = parseFilters(new URLSearchParams("operation=regalo&type=castillo,casa,casa&currency=EUR&priceMin=abc&priceMax=-5&minRooms=0&minBedrooms=99999&amenities=pileta,teletransporte&areaMin=-1&agencyId=xyz&city=%20%20&tour3d=yes&ambient=1"));
  check("valores inválidos se descartan", junk.operation === "todas" && junk.currency === null && junk.priceMin === null && junk.priceMax === null && junk.areaMin === null && junk.agencyId === null && junk.city === null, junk);
  check("tipos y comodidades: sólo los que existen, sin repetir", junk.types.join() === "casa" && junk.amenities.join() === "pileta", junk);
  check("mínimos fuera de rango o en cero se ignoran", junk.minRooms === null && junk.minBedrooms === null, junk);
  check("las marcas sólo valen con 'true'", !junk.tour3dOnly && !junk.ambientOnly);
  const inverted = parseFilters(new URLSearchParams("priceMin=500&priceMax=100&areaMin=90&areaMax=30"));
  check("un máximo menor que el mínimo se descarta", inverted.priceMin === 500 && inverted.priceMax === null && inverted.areaMin === 90 && inverted.areaMax === null, inverted);
  check("la búsqueda de texto se acota", parseFilters(new URLSearchParams(`q=${"x".repeat(500)}`)).q.length === 100);
  check("un texto de ubicación enorme se acota", (parseFilters(new URLSearchParams(`city=${"y".repeat(500)}`)).city ?? "").length === 80);
}

// ── Contar y quitar ─────────────────────────────────────────────────────────
{
  check("contar: sin filtros 0", countActiveFilters(DEFAULT_FILTERS) === 0);
  check("contar: la búsqueda de texto y la inmobiliaria no suman al botón", countActiveFilters({ ...DEFAULT_FILTERS, q: "tigre", agencyId: "a".repeat(24) }) === 0);
  // operación 1 + tipos 1 + precio 1 + ubicación 1 + ambientes 1 + dormitorios 1 + baños 1 + cocheras 1 + superficie 1 + 2 comodidades + 4 extras
  check("contar: cada grupo suma 1 y cada comodidad suma 1", countActiveFilters(full) === 15, countActiveFilters(full));
  check("contar: la moneda sola no es un filtro", countActiveFilters({ ...DEFAULT_FILTERS, currency: "USD" }) === 0);

  const chips = activeChips(full);
  check("etiquetas: una por filtro (tipos y comodidades por separado)", chips.length === 16, chips.map((c) => c.id));
  check("etiquetas: texto claro", chips.some((c) => c.label === "Alquiler") && chips.some((c) => c.label === "PH") && chips.some((c) => c.label === "Palermo, CABA") && chips.some((c) => c.label === "2+ dormitorios") && chips.some((c) => c.label === "60 – 200 m²"), chips.map((c) => c.label));
  check("etiquetas: el precio lleva la moneda", chips.find((c) => c.id === "price")?.label === "$ 150k – 900k", chips.find((c) => c.id === "price")?.label);
  check("etiquetas: precio con un solo extremo", activeChips({ ...DEFAULT_FILTERS, currency: "USD", priceMax: 120000 })[0]?.label === "Hasta US$ 120k" && activeChips({ ...DEFAULT_FILTERS, currency: "USD", priceMin: 2_500_000 })[0]?.label === "Desde US$ 2.5M");
  const cleared = chips.reduce((state, c) => c.clear(state), full);
  check("quitar todas las etiquetas deja sólo la búsqueda, la moneda y la inmobiliaria", countActiveFilters(cleared) === 0 && cleared.q === "palermo" && cleared.agencyId === full.agencyId, cleared);
  const oneType = activeChips(full).find((c) => c.id === "type:casa")!.clear(full);
  check("quitar un tipo deja el otro", oneType.types.join() === "ph");
  const oneAmenity = activeChips(full).find((c) => c.id === "amenity:pileta")!.clear(full);
  check("quitar una comodidad deja la otra", oneAmenity.amenities.join() === "cochera");
  const place = activeChips(full).find((c) => c.id === "place")!.clear(full);
  check("quitar la ubicación borra ciudad y barrio", place.city === null && place.neighborhood === null);
}

// ── Validación de los parámetros de la API ──────────────────────────────────
{
  const params = Object.fromEntries(filtersToSearchParams(full).entries());
  const list = listFiltersSchema.safeParse(params);
  check("la API del listado acepta todos los filtros", list.success, list.success ? undefined : list.error.issues);
  const map = mapFiltersSchema.safeParse({ ...params, bbox: "-59,-35,-58,-34" });
  check("la API del mapa acepta todos los filtros", map.success, map.success ? undefined : map.error.issues);
  if (list.success) {
    check("la validación convierte lo que corresponde", list.data.currency === "ARS" && list.data.minBedrooms === 2 && list.data.areaMax === 200 && list.data.ambient === true && list.data.videos === true && list.data.recent === true && list.data.city === "CABA", list.data);
  }
  check("una moneda inventada se rechaza", !listFiltersSchema.safeParse({ currency: "EUR" }).success);
  check("una marca que no es true/false se rechaza", !listFiltersSchema.safeParse({ ambient: "si" }).success);
  check("los parámetros de siempre siguen valiendo", listFiltersSchema.safeParse({ operation: "venta", type: "casa,ph", priceMin: "1000", minRooms: "2", tour3d: "true", page: "2" }).success);
}

// ── El filtro de Mongo ──────────────────────────────────────────────────────
{
  const parsed = listFiltersSchema.parse(Object.fromEntries(filtersToSearchParams(full).entries()));
  const q = buildPropertyQuery(parsed) as Record<string, unknown>;
  check("siempre sólo lo publicado", q.status === "published");
  check("operación, tipo y moneda", q.operation === "alquiler" && JSON.stringify(q.type) === JSON.stringify({ $in: ["casa", "ph"] }) && q["price.currency"] === "ARS", q);
  check("precio", JSON.stringify(q["price.amount"]) === JSON.stringify({ $gte: 150000, $lte: 900000 }), q["price.amount"]);
  check("mínimos de ambientes, dormitorios, baños y cocheras", JSON.stringify([q["features.rooms"], q["features.bedrooms"], q["features.bathrooms"], q["features.garages"]]) === JSON.stringify([{ $gte: 3 }, { $gte: 2 }, { $gte: 1 }, { $gte: 1 }]));
  check("ubicación exacta", q["address.city"] === "CABA" && q["address.neighborhood"] === "Palermo");
  check("comodidades: todas", JSON.stringify(q.amenities) === JSON.stringify({ $all: ["pileta", "cochera"] }));
  check("extras: recorrido, portada viva y video", q["media.hasTour3d"] === true && q["media.hasAmbientCover"] === true && JSON.stringify(q["media.videos.0"]) === JSON.stringify({ $exists: true }));
  const since = (q.publishedAt as { $gte: Date }).$gte.getTime();
  check("publicadas hace poco: los últimos días", Math.abs(since - (Date.now() - RECENT_DAYS * 86_400_000)) < 5_000, since);
  const area = q.$or as { [k: string]: unknown }[];
  check("superficie: cubierta, o la total si no hay cubierta", Array.isArray(area) && area.length === 2 && JSON.stringify((area[0]!["features.coveredArea"] as object)) === JSON.stringify({ $gte: 60, $lte: 200, $gt: 0 }) && JSON.stringify(area[1]!["features.totalArea"]) === JSON.stringify({ $gte: 60, $lte: 200 }), area);
  check("la búsqueda de texto va aparte (no pisa a la superficie)", JSON.stringify(q.$text) === JSON.stringify({ $search: "palermo" }) && Array.isArray(q.$or));
  check("sin filtros: sólo lo publicado", JSON.stringify(buildPropertyQuery({})) === JSON.stringify({ status: "published" }));
  check("una inmobiliaria inválida se ignora", !("agencyId" in buildPropertyQuery({ agencyId: "no-es-un-id" })));
  check("sólo mínimo de superficie", JSON.stringify((buildPropertyQuery({ areaMin: 50 }).$or as { [k: string]: unknown }[])[1]!["features.totalArea"]) === JSON.stringify({ $gte: 50 }));
}

// ── Límites de los controles deslizantes ────────────────────────────────────
{
  check("niceCeil: redondea hacia arriba a un número limpio", niceCeil(97_000) === 100_000 && niceCeil(1_340) === 2_000 && niceCeil(210_000) === 250_000 && niceCeil(430_000) === 500_000 && niceCeil(600_000) === 1_000_000 && niceCeil(1) === 1, [niceCeil(97_000), niceCeil(1_340), niceCeil(210_000)]);
  check("niceCeil: cero o inválido da 0", niceCeil(0) === 0 && niceCeil(-5) === 0 && niceCeil(NaN) === 0);
  check("niceStep: unos 100 pasos con 1, 2 o 5", niceStep(1_000_000) === 10_000 && niceStep(500) === 5 && niceStep(250_000) === 5_000 && niceStep(0) === 1, [niceStep(1_000_000), niceStep(500), niceStep(250_000)]);
  const facets = {
    prices: [
      { currency: "USD", operation: "venta", min: 60_000, max: 480_000, count: 20 },
      { currency: "ARS", operation: "alquiler", min: 150_000, max: 900_000, count: 12 },
      { currency: "ARS", operation: "venta", min: 90_000_000, max: 240_000_000, count: 3 },
    ],
  };
  check("precio: sin moneda no hay control", priceBounds(facets, null, "todas") === null && priceBounds(null, "USD", null) === null);
  check("precio: una moneda sin publicaciones no tiene rango", priceBounds(facets, "EUR", null) === null);
  check("precio: dólares", JSON.stringify(priceBounds(facets, "USD", "todas")) === JSON.stringify({ min: 0, max: 500_000, step: 5_000 }), priceBounds(facets, "USD", "todas"));
  check("precio: pesos de alquiler no se mezclan con pesos de venta", priceBounds(facets, "ARS", "alquiler")!.max === 1_000_000 && priceBounds(facets, "ARS", "venta")!.max === 250_000_000, [priceBounds(facets, "ARS", "alquiler"), priceBounds(facets, "ARS", "venta")]);
  check("precio: sin operación elegida, el máximo de todas", priceBounds(facets, "ARS", "todas")!.max === 250_000_000);
  check("superficie: hasta lo más grande publicado", areaBounds({ maxArea: 780 }).max === 1_000 && areaBounds({ maxArea: 780 }).step >= 5);
  check("superficie: sin datos, un rango razonable", areaBounds(null).max === 500 && areaBounds({ maxArea: 0 }).max === 500);
}

console.log(`\n${total - failed}/${total} pruebas correctas`);
process.exit(failed > 0 ? 1 : 0);
