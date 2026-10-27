/**
 * Pruebas de los alquileres (tradicional y temporal) — sin base de datos: períodos del precio y su regla por operación,
 * equivalente por noche, distancia a la playa, disponibilidad por fechas, normalización al guardar y lo que viaja a tarjetas y
 * mapa. Correr con `npm run rentals:check`: sale con código 1 si alguna falla.
 */
import {
  BEACH_DISTANCES,
  DEFAULT_PERIOD,
  PERIODS_BY_OPERATION,
  PERIOD_NIGHTS,
  PRICE_PERIODS,
  beachDistanceLabel,
  effectivePeriod,
  isRentalOperation,
  perNightAmount,
  periodPhrase,
  periodSuffix,
} from "../src/config/pricing";
import {
  addDays,
  availabilityText,
  checkRange,
  formatDay,
  isFreeBetween,
  isValidDay,
  normalizeBlocked,
  rangeDays,
  rentalStatus,
  todayAr,
} from "../src/lib/availability";
import { normalizeRentalFields } from "../src/lib/properties/normalize";
import { toPropertyCardData } from "../src/lib/db/property-card-mapper";
import { toPropertyDetail } from "../src/lib/db/property-detail-mapper";
import { AMENITIES, OPERATIONS } from "../src/config/filters";
import { ALL_PHOTO_IDS, EXCLUDED_AGENCIES, LISTINGS, LOCALITY_CENTER, PHOTO_POOLS, SEED_AGENCY_SLUGS, SEED_TAG, photosFor, resolveBlocked, seedKeyOf } from "./vacacional/data";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

// ── Períodos del precio ─────────────────────────────────────────────────────
{
  check("períodos: venta sólo total, alquiler sólo mes, temporal elige", PERIODS_BY_OPERATION.venta.join() === "total" && PERIODS_BY_OPERATION.alquiler.join() === "mensual" && PERIODS_BY_OPERATION.alquiler_temporal.join() === "noche,dia,semana,quincena,mensual");
  check("períodos: cada operación tiene uno por defecto que le vale", OPERATIONS.every((op) => PERIODS_BY_OPERATION[op].includes(DEFAULT_PERIOD[op])));
  check("períodos: uno inválido para la operación cae en el de siempre", effectivePeriod("venta", "noche") === "total" && effectivePeriod("alquiler", "semana") === "mensual" && effectivePeriod("alquiler_temporal", "total") === "noche" && effectivePeriod("alquiler_temporal", "basura") === "noche" && effectivePeriod("alquiler", undefined) === "mensual");
  check("períodos: uno válido se respeta", effectivePeriod("alquiler_temporal", "quincena") === "quincena" && effectivePeriod("alquiler_temporal", "mensual") === "mensual" && effectivePeriod("venta", "total") === "total");
  check("sufijos: /mes, /noche, /día, /semana, /quincena y nada en una venta", periodSuffix("alquiler", "mensual") === "/mes" && periodSuffix("alquiler_temporal", "noche") === "/noche" && periodSuffix("alquiler_temporal", "dia") === "/día" && periodSuffix("alquiler_temporal", "semana") === "/semana" && periodSuffix("alquiler_temporal", "quincena") === "/quincena" && periodSuffix("venta", "total") === "");
  check("sufijos: un alquiler viejo guardado como total se muestra por mes", periodSuffix("alquiler", "total") === "/mes");
  check("frases: 'por noche', 'por mes' y nada para el precio total", periodPhrase("noche") === "por noche" && periodPhrase("mensual") === "por mes" && periodPhrase("total") === "");
  check("alquileres: sólo alquiler y alquiler temporal", isRentalOperation("alquiler") && isRentalOperation("alquiler_temporal") && !isRentalOperation("venta") && !isRentalOperation(undefined));
  check("todos los períodos están definidos", PRICE_PERIODS.every((p) => p === "total" || (PERIOD_NIGHTS[p] ?? 0) >= 1));
}

// ── Equivalente por noche ───────────────────────────────────────────────────
{
  check("por noche: la noche y el día valen 1; la semana ÷ 7; la quincena ÷ 15; el mes ÷ 30", perNightAmount(80_000, "noche") === 80_000 && perNightAmount(80_000, "dia") === 80_000 && perNightAmount(490_000, "semana") === 70_000 && perNightAmount(1_200_000, "quincena") === 80_000 && perNightAmount(900_000, "mensual") === 30_000);
  check("por noche: la venta no tiene equivalente", perNightAmount(120_000, "total") === null);
  check("por noche: un monto inválido no inventa nada", perNightAmount(NaN, "noche") === null && perNightAmount(-5, "noche") === null);
  check("por noche: redondea a la unidad", perNightAmount(100, "semana") === 14);
  check("por noche: lo cobrado por semana y por noche se pueden comparar", perNightAmount(560_000, "semana")! > perNightAmount(70_000, "noche")!);
}

// ── Distancia a la playa ────────────────────────────────────────────────────
{
  check("playa: textos claros", beachDistanceLabel(0) === "Frente al mar" && beachDistanceLabel(100) === "A 100 m de la playa" && beachDistanceLabel(500) === "A 500 m de la playa" && beachDistanceLabel(1000) === "A 1 km de la playa" && beachDistanceLabel(1500) === "A 1,5 km de la playa");
  check("playa: las opciones están ordenadas y empiezan frente al mar", BEACH_DISTANCES[0] === 0 && BEACH_DISTANCES.every((m, i, a) => i === 0 || m > a[i - 1]!));
}

// ── Fechas y disponibilidad ─────────────────────────────────────────────────
{
  check("fechas: días reales", isValidDay("2030-02-28") && !isValidDay("2030-02-30") && !isValidDay("2030-13-01") && !isValidDay("hoy") && !isValidDay(null));
  check("fechas: sumar días cruza meses y años", addDays("2030-01-31", 1) === "2030-02-01" && addDays("2030-12-31", 1) === "2031-01-01" && addDays("2030-03-01", -1) === "2030-02-28");
  check("fechas: hoy en Argentina (no el día en UTC)", todayAr(new Date("2030-06-01T01:30:00Z")) === "2030-05-31" && todayAr(new Date("2030-06-01T05:00:00Z")) === "2030-06-01");
  check("períodos: se valida cada rango", checkRange({ from: "2030-01-05", to: "2030-01-05" }) === null && checkRange({ from: "2030-01-06", to: "2030-01-05" }) === "inverted" && checkRange({ from: "2030-01-05", to: "x" }) === "invalid" && checkRange({ from: "2030-01-01", to: "2031-06-01" }) === "too_long");
  check("períodos: cuenta los dos extremos", rangeDays({ from: "2030-01-05", to: "2030-01-05" }) === 1 && rangeDays({ from: "2030-01-05", to: "2030-01-12" }) === 8);
  const merged = normalizeBlocked([
    { from: "2030-02-10", to: "2030-02-15" },
    { from: "2030-01-05", to: "2030-01-12", note: "  Pérez  " },
    { from: "2030-01-12", to: "2030-01-20" },
    { from: "2030-01-21", to: "2030-01-25" },
    { from: "2030-03-01", to: "2030-02-01" },
  ]);
  check("períodos: se ordenan, se juntan los que se pisan o son consecutivos y se descartan los inválidos", merged.length === 2 && merged[0]!.from === "2030-01-05" && merged[0]!.to === "2030-01-25" && merged[0]!.note === "Pérez" && merged[1]!.from === "2030-02-10", merged);

  const av = { state: "available" as const, blocked: [{ from: "2030-01-10", to: "2030-01-20" }, { from: "2030-03-01", to: "2030-03-05" }] };
  const before = rentalStatus(av, "2030-01-01");
  check("estado: antes del período está disponible y sabe cuándo se ocupa", before.state === "available" && before.nextBusyFrom === "2030-01-10");
  const during = rentalStatus(av, "2030-01-10");
  check("estado: el primer día ocupado ya es no disponible y dice desde cuándo se libera", during.state === "unavailable" && during.reason === "period" && during.freeFrom === "2030-01-21", during);
  check("estado: el último día ocupado todavía es no disponible; el siguiente ya no", rentalStatus(av, "2030-01-20").state === "unavailable" && rentalStatus(av, "2030-01-21").state === "available");
  check("estado: cambia solo con la fecha (la propiedad vuelve a estar disponible)", rentalStatus(av, "2030-01-15").state === "unavailable" && rentalStatus(av, "2030-02-01").state === "available" && rentalStatus(av, "2030-02-01").nextBusyFrom === "2030-03-01");
  check("estado: marcada no disponible lo está siempre, sin importar las fechas", rentalStatus({ state: "unavailable", blocked: [] }, "2030-01-01").state === "unavailable" && rentalStatus({ state: "unavailable", blocked: [] }, "2030-01-01").reason === "manual");
  check("estado: sin datos está disponible", rentalStatus(null, "2030-01-01").state === "available" && rentalStatus({}, "2030-01-01").state === "available");

  check("libre en mis fechas: sólo si ningún día del rango está ocupado", isFreeBetween(av, "2030-01-01", "2030-01-09") && !isFreeBetween(av, "2030-01-09", "2030-01-10") && !isFreeBetween(av, "2030-01-15", "2030-01-16") && !isFreeBetween(av, "2030-01-20", "2030-01-25") && isFreeBetween(av, "2030-01-21", "2030-02-28") && !isFreeBetween(av, "2030-02-28", "2030-03-01"));
  check("libre en mis fechas: una marcada no disponible nunca lo está", !isFreeBetween({ state: "unavailable", blocked: [] }, "2030-05-01", "2030-05-02"));

  check("textos: disponible, hasta cuándo, no disponible y desde cuándo se libera", availabilityText(rentalStatus(null, "2030-01-01"), "2030-01-01") === "Disponible" && availabilityText(before, "2030-01-01") === "Disponible hasta el 10 de enero" && availabilityText(during, "2030-01-10") === "No disponible · libre desde el 21 de enero" && availabilityText(rentalStatus({ state: "unavailable" }, "2030-01-01"), "2030-01-01") === "No disponible");
  check("textos: el año aparece sólo si no es el actual", formatDay("2031-01-05", "2030-06-01") === "5 de enero de 2031" && formatDay("2030-01-05", "2030-06-01") === "5 de enero");
}

// ── Lo que el servidor decide al guardar ────────────────────────────────────
{
  const base = { operation: "alquiler_temporal", status: "published" as const, price: { amount: 490_000, currency: "ARS" as const, expenses: 0, period: "semana" } };
  const t = normalizeRentalFields({ ...base, availability: { state: "available", blocked: [{ from: "2030-01-10", to: "2030-01-20" }, { from: "2030-01-15", to: "2030-01-25" }] } }, new Date("2030-01-01T12:00:00Z"));
  check("guardar: el temporal calcula el equivalente por noche", t.price.period === "semana" && t.price.perNight === 70_000, t.price);
  check("guardar: junta los períodos que se pisan y calcula el estado de hoy", t.availability.blocked.length === 1 && t.availability.blocked[0]!.to === "2030-01-25" && t.availability.current === "available");
  check("guardar: si hoy cae en un período, el estado queda no disponible", normalizeRentalFields({ ...base, availability: { state: "available", blocked: [{ from: "2029-12-30", to: "2030-01-05" }] } }, new Date("2030-01-01T12:00:00Z")).availability.current === "unavailable");
  const venta = normalizeRentalFields({ operation: "venta", status: "published", price: { amount: 120_000, currency: "USD", expenses: 0, period: "mensual" }, availability: { state: "unavailable", blocked: [{ from: "2030-01-10", to: "2030-01-20" }] } });
  check("guardar: una venta es siempre precio total, sin equivalente por noche ni disponibilidad", venta.price.period === "total" && venta.price.perNight === undefined && venta.availability.state === "available" && venta.availability.blocked.length === 0 && venta.availability.current === "available", venta);
  const alq = normalizeRentalFields({ operation: "alquiler", status: "published", price: { amount: 900_000, currency: "ARS", expenses: 0, period: "total" } });
  check("guardar: el alquiler de siempre es por mes (y guarda su equivalente por noche)", alq.price.period === "mensual" && alq.price.perNight === 30_000, alq.price);
  const legacy = normalizeRentalFields({ operation: "alquiler", status: "rented", price: { amount: 900_000, currency: "ARS", expenses: 0, period: "mensual" } });
  check("guardar: 'alquilada' (estado viejo) sigue publicada y pasa a no disponible", legacy.status === "published" && legacy.availability.state === "unavailable" && legacy.availability.current === "unavailable", legacy);
  check("guardar: una venta reservada o vendida no se toca", normalizeRentalFields({ operation: "venta", status: "sold", price: { amount: 1, currency: "USD", expenses: 0, period: "total" } }).status === "sold");
}

// ── Datos del seed de alquileres temporales (coherencia, sin base de datos) ─────────────────────────
{
  const L = LISTINGS;
  const byLocality = (loc: string) => L.filter((l) => l.locality === loc);
  check("seed: 3 o 4 propiedades por localidad (Mar del Plata, Aguas Verdes, Mar del Tuyú y Cariló)", ["Mar del Plata", "Aguas Verdes", "Mar del Tuyú", "Cariló"].every((loc) => byLocality(loc).length >= 3 && byLocality(loc).length <= 4) && Object.keys(LOCALITY_CENTER).length === 4 && L.length >= 12 && L.length <= 16, L.length);
  check("seed: mezcla de departamentos, dúplex y casas", new Set(L.map((l) => l.type)).size === 3 && ["departamento", "duplex", "casa"].every((t) => L.some((l) => l.type === t)));
  check("seed: las claves son únicas (si no, correrlo dos veces duplicaría)", new Set(L.map(seedKeyOf)).size === L.length && L.every((l) => /^[a-z0-9-]+$/.test(l.key)));
  check("seed: todas son alquileres temporales con un período válido y precio positivo", L.every((l) => PERIODS_BY_OPERATION.alquiler_temporal.includes(l.price.period) && l.price.amount > 0));
  check("seed: la distancia a la playa es una de las opciones del formulario", L.every((l) => (BEACH_DISTANCES as readonly number[]).includes(l.beachDistance)));
  check("seed: los precios son plausibles por noche equivalente (entre $30.000 y $300.000, o entre US$ 100 y US$ 400)", L.every((l) => { const n = perNightAmount(l.price.amount, l.price.period)!; return l.price.currency === "ARS" ? n >= 30_000 && n <= 300_000 : n >= 100 && n <= 400; }), L.map((l) => [l.key, perNightAmount(l.price.amount, l.price.period)]));
  check("seed: coherencia interna (ambientes ≥ dormitorios, cubierta ≤ total, dormitorios y baños razonables)", L.every((l) => l.rooms >= l.bedrooms && l.coveredArea <= l.totalArea && l.bedrooms >= 1 && l.bathrooms >= 1 && l.bathrooms <= l.bedrooms + 1));
  check("seed: sólo comodidades que existen y sin repetir", L.every((l) => l.amenities.every((a) => (AMENITIES as readonly string[]).includes(a)) && new Set(l.amenities).size === l.amenities.length));
  check("seed: variedad para la demo (disponibles y no disponibles, con mascotas, con períodos ocupados)", (() => {
    const states = L.map((l) => rentalStatus({ state: l.availability.state, blocked: resolveBlocked(l, "2030-06-01") }, "2030-06-01").state);
    return states.includes("available") && states.includes("unavailable") && L.some((l) => l.amenities.includes("mascotas")) && L.some((l) => l.availability.busy.length > 0);
  })());
  check("seed: Aguas Verdes (el caso del video) tiene mascotas, playa cerca, disponibles y alguna ocupada", (() => {
    const av = byLocality("Aguas Verdes");
    return av.some((l) => l.amenities.includes("mascotas") && l.beachDistance <= 200) && av.some((l) => l.availability.state === "available") && av.some((l) => l.availability.state === "unavailable");
  })());
  check("seed: los períodos ocupados son válidos y no se pisan", L.every((l) => { const b = resolveBlocked(l, "2030-06-01"); return b.every((r) => checkRange(r) === null) && normalizeBlocked(b).length === b.length; }));
  check("seed: las coordenadas quedan dentro de la provincia de Buenos Aires, cerca de su localidad", L.every((l) => { const c = LOCALITY_CENTER[l.locality]; const lng = c.lng + l.offset.lng; const lat = c.lat + l.offset.lat; return Math.abs(lng - c.lng) < 0.08 && Math.abs(lat - c.lat) < 0.08 && lat < -36 && lat > -39 && lng < -56 && lng > -58; }));
  check("seed: cada propiedad tiene fotos distintas, de nuestro banco revisado, y una playa", L.every((l, i) => { const ph = photosFor(l, i); return ph.length >= 5 && new Set(ph).size === ph.length && ph.every((u) => ALL_PHOTO_IDS.some((id) => u.includes(id))) && ph.some((u) => PHOTO_POOLS.beach.some((id) => u.includes(id))); }));
  check("seed: una casa abre con el frente y un dúplex o departamento con el living (no se mezclan)", L.every((l, i) => { const first = photosFor(l, i)[0]!; return l.type === "casa" ? [...PHOTO_POOLS.house, ...PHOTO_POOLS.cottage].some((id) => first.includes(id)) : PHOTO_POOLS.living.some((id) => first.includes(id)); }));
  check("seed: las de Cariló abren con casas de bosque", L.every((l, i) => l.locality !== "Cariló" || PHOTO_POOLS.cottage.some((id) => photosFor(l, i)[0]!.includes(id))));
  check("seed: las inmobiliarias son las 4 del seed original y las excluidas no están", SEED_AGENCY_SLUGS.length === 4 && SEED_AGENCY_SLUGS.every((s) => !(EXCLUDED_AGENCIES.slugs as readonly string[]).includes(s)) && EXCLUDED_AGENCIES.ids.length === 2 && EXCLUDED_AGENCIES.slugs.includes("inmobiliaria-ss") && EXCLUDED_AGENCIES.slugs.includes("test-1-santi") && EXCLUDED_AGENCIES.ids.includes("6a9e1a2622a2aace3e629905") && EXCLUDED_AGENCIES.ids.includes("6add6c04b6aef3cd6c0490a7"));
  check("seed: se reparten entre las 4 inmobiliarias de forma pareja", (() => { const counts = SEED_AGENCY_SLUGS.map((_, a) => L.filter((_, i) => i % SEED_AGENCY_SLUGS.length === a).length); return Math.max(...counts) - Math.min(...counts) <= 1; })());
  check("seed: la marca identifica sólo este seed", SEED_TAG === "vacacional-v1" && L.every((l) => seedKeyOf(l).startsWith(`${SEED_TAG}:`)));
  check("seed: sin datos de terceros (ningún teléfono, email ni enlace personal en los textos)", L.every((l) => !/@|https?:|\+54|\b\d{8,}\b/.test(`${l.title} ${l.description}`)));
}

// ── Lo que viaja a tarjetas, mapa y ficha ───────────────────────────────────
{
  const doc = (operation: string, price: { amount: number; currency: string; period: string; expenses?: number }, availability?: { state?: string; blocked?: { from: string; to: string; note?: string }[] }, features?: { beachDistance?: number }) => ({
    _id: "p1",
    slug: "casa-1",
    title: "Casa 1",
    price,
    operation,
    type: "casa",
    address: { city: "Aguas Verdes", showExact: true },
    location: { type: "Point", coordinates: [-56.7, -36.5] },
    features,
    availability,
    publishedAt: new Date(),
  });
  const now = new Date("2030-01-15T15:00:00Z").getTime();
  const busy = toPropertyCardData(doc("alquiler_temporal", { amount: 80_000, currency: "ARS", period: "noche" }, { state: "available", blocked: [{ from: "2030-01-10", to: "2030-01-20" }] }, { beachDistance: 100 }), now);
  check("tarjeta: un temporal ocupado hoy sale no disponible, con su período y la playa", busy.rental?.state === "unavailable" && busy.rental.freeFrom === "2030-01-21" && busy.period === "noche" && busy.beachDistance === 100, busy);
  const free = toPropertyCardData(doc("alquiler_temporal", { amount: 80_000, currency: "ARS", period: "noche" }, { state: "available", blocked: [] }), now);
  check("tarjeta: un temporal libre sale disponible", free.rental?.state === "available");
  check("tarjeta: una venta no tiene estado de alquiler (su pin no cambia de color)", toPropertyCardData(doc("venta", { amount: 100_000, currency: "USD", period: "total" }), now).rental === null);
  check("tarjeta: sin datos de disponibilidad un alquiler es disponible", toPropertyCardData(doc("alquiler", { amount: 900_000, currency: "ARS", period: "mensual" }), now).rental?.state === "available");
  check("tarjeta: un alquiler viejo guardado como total se muestra por mes", toPropertyCardData(doc("alquiler", { amount: 900_000, currency: "ARS", period: "total" }), now).period === "mensual");

  const detail = toPropertyDetail({ ...doc("alquiler_temporal", { amount: 80_000, currency: "ARS", period: "noche", expenses: 0 }, { state: "available", blocked: [{ from: "2020-01-01", to: "2020-01-05", note: "privada" }, { from: "2099-02-10", to: "2099-02-15", note: "Pérez" }] }, { beachDistance: 300 }), agencyId: null, address: { city: "Aguas Verdes" }, amenities: [], media: {} });
  check("ficha: muestra sólo los períodos ocupados que faltan y nunca las notas", detail.availability?.busy.length === 1 && detail.availability.busy[0]!.from === "2099-02-10" && !JSON.stringify(detail).includes("Pérez") && !JSON.stringify(detail).includes("privada"), detail.availability);
  check("ficha: trae la distancia a la playa y el período", detail.features.beachDistance === 300 && detail.price.period === "noche");
  check("ficha: una venta no trae disponibilidad", toPropertyDetail({ ...doc("venta", { amount: 1, currency: "USD", period: "total", expenses: 0 }), agencyId: null, address: { city: "X" }, amenities: [], media: {} }).availability === null);
}

console.log(`\n${total - failed}/${total} pruebas correctas`);
process.exit(failed > 0 ? 1 : 0);
