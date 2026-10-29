/**
 * Pruebas de los filtros de propiedades (mapa y listado) — sin base de datos: el estado, su ida y vuelta por la dirección, las
 * etiquetas que se pueden quitar, la validación de los parámetros y el filtro de Mongo que se arma. Correr con
 * `npm run filters:check`: sale con código 1 si alguna falla.
 */
import { DEFAULT_FILTERS, RECENT_DAYS, activeChips, countActiveFilters, filtersEqual, filtersToSearchParams, parseFilters, withOperation, type PropertyFiltersState } from "../src/lib/filters/state";
import { buildPropertyQuery } from "../src/lib/db/property-query";
import { listFiltersSchema, mapFiltersSchema } from "../src/lib/validation/filters";
import { areaBounds, niceCeil, niceStep, priceBounds } from "../src/lib/filters/bounds";
import { MAX_RELAX, relaxCandidates } from "../src/lib/filters/relax";

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
  beachMax: 300,
  from: "2030-01-05",
  to: "2030-01-12",
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
  const inverted = parseFilters(new URLSearchParams("operation=venta&priceMin=500&priceMax=100&areaMin=90&areaMax=30"));
  check("un máximo menor que el mínimo se descarta", inverted.priceMin === 500 && inverted.priceMax === null && inverted.areaMin === 90 && inverted.areaMax === null, inverted);
  check("la búsqueda de texto se acota", parseFilters(new URLSearchParams(`q=${"x".repeat(500)}`)).q.length === 100);
  check("un texto de ubicación enorme se acota", (parseFilters(new URLSearchParams(`city=${"y".repeat(500)}`)).city ?? "").length === 80);
}

// ── Contar y quitar ─────────────────────────────────────────────────────────
{
  check("contar: sin filtros 0", countActiveFilters(DEFAULT_FILTERS) === 0);
  check("contar: la búsqueda de texto y la inmobiliaria no suman al botón", countActiveFilters({ ...DEFAULT_FILTERS, q: "tigre", agencyId: "a".repeat(24) }) === 0);
  // operación 1 + tipos 1 + precio 1 + ubicación 1 + ambientes 1 + dormitorios 1 + baños 1 + cocheras 1 + superficie 1 + 2 comodidades + 4 extras + playa 1 + fechas 1
  check("contar: cada grupo suma 1 y cada comodidad suma 1", countActiveFilters(full) === 17, countActiveFilters(full));
  check("contar: la moneda sola no es un filtro", countActiveFilters({ ...DEFAULT_FILTERS, currency: "USD" }) === 0);

  const chips = activeChips(full);
  // 17 filtros del botón + la búsqueda de texto (que tiene etiqueta para poder quitarla) + 1 (tipos y comodidades van por separado)
  check("etiquetas: una por filtro (tipos y comodidades por separado) y una para el texto", chips.length === 19, chips.map((c) => c.id));
  check("etiquetas: el texto de búsqueda tiene la suya", chips.some((c) => c.id === "q" && c.label === "Texto: palermo"), chips.map((c) => c.label));
  check("etiquetas: un texto largo se acorta", activeChips({ ...DEFAULT_FILTERS, q: "x".repeat(60) })[0]!.label.length <= 31);
  check("etiquetas: texto claro", chips.some((c) => c.label === "Alquiler") && chips.some((c) => c.label === "PH") && chips.some((c) => c.label === "Palermo, CABA") && chips.some((c) => c.label === "2+ dormitorios") && chips.some((c) => c.label === "60 – 200 m²"), chips.map((c) => c.label));
  check("etiquetas: el precio lleva la moneda y su unidad (por mes en un alquiler)", chips.find((c) => c.id === "price")?.label === "$ 150k – 900k por mes", chips.find((c) => c.id === "price")?.label);
  check("etiquetas: playa y fechas libres", chips.some((c) => c.id === "beach" && c.label === "Hasta 300 m de la playa") && chips.some((c) => c.id === "dates" && /^Libre del 5 de enero de 2030 al 12 de enero de 2030$/.test(c.label)), chips.map((c) => c.label));
  check("etiquetas: precio con un solo extremo", activeChips({ ...DEFAULT_FILTERS, operation: "venta", currency: "USD", priceMax: 120000 }).find((c) => c.id === "price")?.label === "Hasta US$ 120k" && activeChips({ ...DEFAULT_FILTERS, operation: "venta", currency: "USD", priceMin: 2_500_000 }).find((c) => c.id === "price")?.label === "Desde US$ 2.5M");
  check("etiquetas: el temporal dice por noche", activeChips({ ...DEFAULT_FILTERS, operation: "alquiler_temporal", currency: "ARS", priceMax: 90000 }).find((c) => c.id === "price")?.label === "Hasta $ 90k por noche");
  const cleared = chips.reduce((state, c) => c.clear(state), full);
  check("quitar todas las etiquetas deja sólo la inmobiliaria (que tiene la suya aparte)", JSON.stringify(cleared) === JSON.stringify({ ...DEFAULT_FILTERS, agencyId: full.agencyId }), cleared);
  check("quitar el precio quita también la moneda", activeChips(full).find((c) => c.id === "price")!.clear(full).currency === null);
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
  check("un máximo en 0 es válido (da cero resultados, no un error 400)", listFiltersSchema.safeParse({ priceMax: "0", areaMax: "0" }).success && mapFiltersSchema.safeParse({ priceMax: "0" }).success);
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
  check("la moneda sola no restringe nada", JSON.stringify(buildPropertyQuery({ currency: "USD" })) === JSON.stringify({ status: "published" }));
  check("la moneda acota junto con el precio (y una operación)", buildPropertyQuery({ operation: "venta", currency: "USD", priceMax: 100 })["price.currency"] === "USD" && buildPropertyQuery({ operation: "venta", currency: "USD", priceMin: 1 })["price.currency"] === "USD");
}

// ── Filtros acumulativos y reversibles (el error: filtrar, quitar el filtro y seguir viendo cero) ──────
{
  /** La consulta que llega a Mongo para un estado: la misma ruta que recorre la pantalla (dirección → validación → filtro). */
  const queryFor = (state: PropertyFiltersState) => JSON.stringify(buildPropertyQuery(listFiltersSchema.parse(Object.fromEntries(filtersToSearchParams(state).entries()))));
  const base = queryFor(DEFAULT_FILTERS);
  check("1. sin filtros: sólo lo publicado", base === JSON.stringify({ status: "published" }), base);

  const withOp = { ...DEFAULT_FILTERS, operation: "alquiler" as const };
  const withPrice = { ...withOp, currency: "USD" as const, priceMax: 100_000 };
  check("2. aplicar un filtro cambia la consulta", queryFor(withOp) !== base);
  check("3. sumar un segundo filtro los combina", /"operation":"alquiler"/.test(queryFor(withPrice)) && /"price\.amount"/.test(queryFor(withPrice)) && /"price\.currency":"USD"/.test(queryFor(withPrice)), queryFor(withPrice));
  const priceChip = activeChips(withPrice).find((c) => c.id === "price")!;
  check("4. quitar uno conserva el otro y no deja restos del quitado", queryFor(priceChip.clear(withPrice)) === queryFor(withOp), queryFor(priceChip.clear(withPrice)));
  check("4b. el caso del informe: alquiler + dólares + precio, quitar el precio no deja la moneda", !/currency/.test(queryFor(priceChip.clear(withPrice))) && !filtersToSearchParams(priceChip.clear(withPrice)).has("currency"));
  const textChip = activeChips({ ...withOp, q: "palerm" }).find((c) => c.id === "q")!;
  check("4c. quitar el texto de búsqueda deja los demás filtros y saca el $text", queryFor(textChip.clear({ ...withOp, q: "palerm" })) === queryFor(withOp) && /"\$text"/.test(queryFor({ ...withOp, q: "palerm" })));
  const noAgency: PropertyFiltersState = { ...full, agencyId: null };
  check("5. limpiar todo vuelve al estado inicial", queryFor(activeChips(full).reduce((s, c) => c.clear(s), noAgency)) === base);
  check("6. modificar un filtro recalcula con el valor nuevo, sin el anterior", (() => {
    const a = queryFor({ ...withPrice, priceMax: 200_000 });
    return /"\$lte":200000/.test(a) && !/100000/.test(a);
  })());
  check("7. cambiar la operación no deja la anterior", !/alquiler/.test(queryFor({ ...withOp, operation: "venta" })) && !/operation/.test(queryFor({ ...withOp, operation: "todas" })));

  // Propiedad general: si se quitan todas las etiquetas MENOS una y después se quita esa, nunca queda un filtro escondido.
  const all = activeChips(full);
  const hidden = all.filter((target) => {
    const others = all.filter((c) => c.id !== target.id).reduce((s, c) => c.clear(s), noAgency);
    return queryFor(target.clear(others)) !== base;
  });
  check("8. ninguna etiqueta deja un filtro escondido al quitarla", hidden.length === 0, hidden.map((c) => c.id));
  // Lo mismo para los controles de la hoja que fijan la moneda antes de elegir un precio.
  check("9. la moneda elegida sin precio no cambia los resultados", queryFor({ ...DEFAULT_FILTERS, currency: "USD" }) === base && queryFor({ ...withOp, currency: "USD" }) === queryFor(withOp));
}

// ── El precio pertenece a una operación; alquiler temporal por noche; playa y fechas libres ──────────
{
  const keys = (q: Record<string, unknown>) => Object.keys(q).sort().join(",");
  const params = (x: PropertyFiltersState) => filtersToSearchParams(x);
  check("precio: sin operación no hay rango (ni en la dirección ni al leerla)", !params({ ...DEFAULT_FILTERS, currency: "USD", priceMax: 100 }).has("priceMax") && parseFilters(new URLSearchParams("priceMax=100000&priceMin=1&currency=USD")).priceMax === null);
  check("precio: con operación sí", params({ ...DEFAULT_FILTERS, operation: "venta", currency: "USD", priceMax: 100 }).get("priceMax") === "100" && parseFilters(new URLSearchParams("operation=venta&priceMax=100000&currency=USD")).priceMax === 100000);
  const base = { ...DEFAULT_FILTERS, operation: "venta" as const, currency: "USD" as const, priceMin: 50_000, priceMax: 100_000, from: "2030-01-05", to: "2030-01-12" };
  const sold = withOperation(base, "alquiler");
  check("operación: cambiarla descarta el rango de precio y su moneda (no se arrastra un monto de venta a un alquiler)", sold.priceMin === null && sold.priceMax === null && sold.currency === null && sold.operation === "alquiler");
  check("operación: pasar a venta descarta las fechas libres (una venta no se alquila)", withOperation({ ...base, operation: "alquiler" }, "venta").from === null && withOperation({ ...base, operation: "alquiler" }, "alquiler_temporal").from === "2030-01-05");
  check("operación: la misma no cambia nada", withOperation(base, "venta") === base);
  check("operación: quitar su etiqueta quita también el precio", (() => {
    const cleared = activeChips({ ...base, operation: "alquiler_temporal" }).find((c) => c.id === "operation")!.clear({ ...base, operation: "alquiler_temporal" });
    return cleared.operation === "todas" && cleared.priceMax === null && cleared.currency === null;
  })());

  check("fechas: valen juntas y bien ordenadas", parseFilters(new URLSearchParams("operation=alquiler&from=2030-01-05&to=2030-01-12")).from === "2030-01-05" && parseFilters(new URLSearchParams("from=2030-01-12&to=2030-01-05")).from === null && parseFilters(new URLSearchParams("from=2030-01-05")).from === null && parseFilters(new URLSearchParams("from=2030-02-31&to=2030-03-01")).from === null);
  check("fechas: con una venta se descartan; sin operación valen (sólo traen alquileres)", parseFilters(new URLSearchParams("operation=venta&from=2030-01-05&to=2030-01-12")).from === null && parseFilters(new URLSearchParams("from=2030-01-05&to=2030-01-12")).from === "2030-01-05");
  check("playa: un número de metros", parseFilters(new URLSearchParams("beach=300")).beachMax === 300 && parseFilters(new URLSearchParams("beach=abc")).beachMax === null && parseFilters(new URLSearchParams("beach=-4")).beachMax === null && parseFilters(new URLSearchParams("beach=0")).beachMax === 0);

  const qs = (s: Record<string, string>) => buildPropertyQuery(listFiltersSchema.parse(s)) as Record<string, unknown>;
  check("consulta: el temporal compara el equivalente por noche; el alquiler de siempre y la venta, el monto", "price.perNight" in qs({ operation: "alquiler_temporal", priceMax: "90000" }) && !("price.amount" in qs({ operation: "alquiler_temporal", priceMax: "90000" })) && "price.amount" in qs({ operation: "alquiler", priceMax: "900000" }) && "price.amount" in qs({ operation: "venta", priceMax: "100" }));
  check("consulta: sin operación el precio no filtra (aunque llegue en la dirección)", keys(qs({ priceMax: "100", currency: "USD" })) === "status");
  check("consulta: hasta tantos metros de la playa", JSON.stringify(qs({ beach: "300" })["features.beachDistance"]) === JSON.stringify({ $lte: 300 }));
  const free = qs({ operation: "alquiler_temporal", from: "2030-01-05", to: "2030-01-12" });
  check("consulta: libre en mis fechas excluye lo no disponible y lo que se pisa con un período ocupado", JSON.stringify(free["availability.state"]) === JSON.stringify({ $ne: "unavailable" }) && JSON.stringify(free["availability.blocked"]) === JSON.stringify({ $not: { $elemMatch: { from: { $lte: "2030-01-12" }, to: { $gte: "2030-01-05" } } } }), free);
  check("consulta: fechas sin operación sólo traen alquileres; con una venta se ignoran; un rango roto se ignora", JSON.stringify(qs({ from: "2030-01-05", to: "2030-01-12" }).operation) === JSON.stringify({ $in: ["alquiler", "alquiler_temporal"] }) && !("availability.blocked" in qs({ operation: "venta", from: "2030-01-05", to: "2030-01-12" })) && !("availability.blocked" in qs({ from: "2030-01-12", to: "2030-01-05" })));
  check("consulta: las fechas no pisan la superficie ni el texto", Array.isArray(qs({ from: "2030-01-05", to: "2030-01-12", areaMin: "50" }).$or));
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

// ── Sugerencias cuando no hay resultados (qué filtro conviene quitar) ───────
{
  check("sugerencias: sin filtros no hay nada que quitar", relaxCandidates(DEFAULT_FILTERS).length === 0);

  const cands = relaxCandidates(full);
  const chipIds = activeChips(full).map((c) => c.id);
  check("sugerencias: una por cada etiqueta aplicada (hasta el tope), con su texto", cands.length === Math.min(chipIds.length, MAX_RELAX) && cands.every((c, i) => c.chipId === chipIds[i] && c.label.length > 0), cands.map((c) => c.chipId));
  const stillThere = cands.filter((c) => activeChips(parseFilters(new URLSearchParams(c.params))).some((x) => x.id === c.chipId));
  check("sugerencias: cada una quita EXACTAMENTE esa etiqueta (la dirección resultante ya no la tiene)", stillThere.length === 0, stillThere.map((c) => c.chipId));
  check("sugerencias: cada dirección es válida para la API y arma un filtro de Mongo", cands.every((c) => { const r = listFiltersSchema.safeParse(Object.fromEntries(new URLSearchParams(c.params).entries())); return r.success && typeof buildPropertyQuery(r.data) === "object"; }));
  check("sugerencias: probar una no cambia el estado de origen", filtersEqual(full, { ...full }) && relaxCandidates(full).length === cands.length);

  // Quitar la operación se lleva el precio (no hay precio sin operación): la sugerencia lo respeta.
  const opChip = cands.find((c) => c.chipId === "operation");
  check("sugerencias: sin la operación tampoco queda el precio ni la moneda", !!opChip && !/priceM(in|ax)=|currency=/.test(opChip.params) && !/operation=/.test(opChip.params), opChip);
  // El texto de búsqueda es un filtro como cualquier otro: se puede quitar desde acá.
  const qChip = cands.find((c) => c.chipId === "q");
  check("sugerencias: el texto buscado también se ofrece quitar", !!qChip && !/(^|&)q=/.test(qChip.params) && /^Texto: /.test(qChip.label), qChip);
  const withAgency = relaxCandidates({ ...DEFAULT_FILTERS, agencyId: "a".repeat(24), types: ["casa"] });
  check("sugerencias: la inmobiliaria elegida se conserva (no se ofrece quitarla)", withAgency.length === 1 && withAgency.every((c) => c.params.includes(`agencyId=${"a".repeat(24)}`)), withAgency);
}

console.log(`\n${total - failed}/${total} pruebas correctas`);
process.exit(failed > 0 ? 1 : 0);
