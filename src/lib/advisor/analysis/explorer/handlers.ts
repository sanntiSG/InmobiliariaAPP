/**
 * Handlers del modo explorador: buscar con lenguaje natural, recomendar,
 * bajas de precio, precio típico, comparar, "¿está bien de precio?", recorridos
 * 360°, novedades, populares e inmobiliarias por zona. Sólo usan datos
 * públicos y, para recomendar, lo que la propia persona ya hizo en su cuenta.
 */
import { Types } from "mongoose";
import type { PropertyCardData } from "@/components/property/types";
import { Property } from "@/lib/db/models/Property";
import { getRecommendations } from "@/lib/recommendations/engine";
import { change, clip, count, daysAgo, list, money, n0, pct, pick, plural, quote } from "../../compose/format";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { describeSearch, filterCount, operationText, typeLabel } from "../../compose/vocab";
import {
  agenciesByZone,
  loadCardsByIds,
  newestCards,
  popularCards,
  priceStats,
  recentPriceDrops,
  searchCards,
  searchLinks,
  topZones,
} from "../../data/market";
import type { AdvisorBlock, AdvisorAction, Slots, SuggestionQuery } from "../../types";
import type { Handler } from "../types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Nombre corto de una tarjeta; si hay títulos repetidos se agrega el precio para distinguirlas. */
function labelOf(card: PropertyCardData, all: PropertyCardData[], max = 30): string {
  const dup = all.filter((c) => c.title === card.title).length > 1;
  return dup ? `${clip(card.title, max - 12)} · ${money(card.price, card.currency)}` : clip(card.title, max);
}

/** Botones "ver todo": listado y mapa con los mismos filtros. */
function linkActions(slots: Slots, total: number): AdvisorAction[] {
  const links = searchLinks(slots);
  return [
    { label: total > 6 ? `Ver las ${n0(total)} en el listado` : "Ver en el listado", href: links.list, kind: "primary" },
    { label: "Ver en el mapa", href: links.map, kind: "secondary" },
  ];
}

/** Sugerencias de arranque con zonas reales cuando la búsqueda no trae pistas. */
async function zoneStarters(): Promise<SuggestionQuery[]> {
  const zones = await topZones(3);
  return zones.map((z) => sug("explorer.search", `Propiedades en ${z.zone}`, { slots: { zones: [z.zone] }, hint: `${z.count} publicadas` }));
}

function followUpsFor(slots: Slots, items: PropertyCardData[]): SuggestionQuery[] {
  const out: SuggestionQuery[] = [];
  if (slots.zones?.length || slots.types?.length || slots.operation) {
    out.push(sug("explorer.price_typical", slots.zones?.length ? `¿Cuánto cuesta en ${slots.zones[0]}?` : "¿Cuánto cuestan en general?", { slots }));
    out.push(sug("explorer.price_drops", "¿Alguna bajó de precio?", { slots }));
  }
  if (!slots.withTour) out.push(sug("explorer.with_tour", "Solo con recorrido 360°", { slots }));
  if (items.length >= 2) out.push(sug("explorer.compare", "Comparar las primeras", { slots: { propertyIds: items.slice(0, 3).map((c) => c.id) } }));
  return out;
}

// ─── Buscar ──────────────────────────────────────────────────────────────────

export const search: Handler = async (env) => {
  const { slots } = env;
  if (filterCount(slots) === 0) {
    const popular = await popularCards({}, 4);
    return {
      lead: "Contame un poco más para buscarte bien: qué tipo de propiedad, en qué zona y hasta qué precio. Por ejemplo: “departamento de 2 ambientes en Palermo hasta 120 mil dólares con cochera”. Mientras tanto, esto es lo que más se mira:",
      blocks: popular.items.length > 0 ? [{ type: "cards", items: popular.items }] : [],
      followUps: dedupeSuggestions(await zoneStarters()),
      resultIds: popular.items.map((c) => c.id),
    };
  }

  const res = await searchCards(slots, 6);
  const what = describeSearch(slots);

  if (res.total === 0) {
    const zones = await topZones(3);
    return {
      lead: `No encontré ${lcFirst(what)} publicadas por ahora. Probá con menos requisitos o mirá dónde hay más oferta: ${list(zones.map((z) => z.zone))}.`,
      blocks: [],
      followUps: dedupeSuggestions([
        ...(slots.priceMax || slots.priceMin ? [sug("explorer.search", "Sin límite de precio", { slots: { ...slots, priceMax: undefined, priceMin: undefined } })] : []),
        ...(slots.amenities?.length ? [sug("explorer.search", "Sin exigir comodidades", { slots: { ...slots, amenities: undefined } })] : []),
        ...(slots.zones?.length ? [sug("explorer.search", "En cualquier zona", { slots: { ...slots, zones: undefined } })] : []),
        ...(await zoneStarters()),
      ]),
    };
  }

  const relaxedText = res.relaxed.length > 0 ? ` No había exactamente eso, así que te muestro ${list(res.relaxed)}.` : "";
  const lead = `${pick([`Encontré ${count(res.total, "propiedad", "propiedades")}`, `Hay ${count(res.total, "propiedad", "propiedades")}`], env.seed)} para “${lcFirst(what)}”${res.total > res.items.length ? `; te muestro ${res.items.length}` : ""}.${relaxedText}`;

  return {
    lead,
    blocks: [{ type: "cards", items: res.items }],
    followUps: dedupeSuggestions(followUpsFor(slots, res.items)),
    actions: linkActions(slots, res.total),
    resultIds: res.items.map((c) => c.id),
    focusPropertyId: res.items[0]?.id,
  };
};

// ─── Recomendar ──────────────────────────────────────────────────────────────

export const recommend: Handler = async (env) => {
  if (env.userId) {
    const recs = await getRecommendations(env.userId, 6);
    if (recs.length > 0) {
      const items = recs.map((r) => ({ ...r.card, reason: r.reason }));
      const learned = recs.some((r) => !r.reasons.includes("trending") || r.reasons.length > 1);
      return {
        lead: learned
          ? `Armé estas según lo que venís mirando, guardando y tus preferencias. La que mejor encaja: ${quote(items[0]!.title)} — ${items[0]!.reason!.charAt(0).toLowerCase()}${items[0]!.reason!.slice(1)}`
          : "Todavía te conozco poco, así que te muestro lo que más interés genera. A medida que guardes y mires propiedades, mis recomendaciones se ajustan a vos.",
        blocks: [{ type: "cards", items }],
        followUps: dedupeSuggestions([
          sug("explorer.price_drops", "¿Alguna bajó de precio?"),
          sug("explorer.new", "¿Qué hay de nuevo?"),
          ...(items.length >= 2 ? [sug("explorer.compare", "Comparar las primeras", { slots: { propertyIds: items.slice(0, 3).map((c) => c.id) } })] : []),
        ]),
        actions: [{ label: "Ver todas mis recomendaciones", href: "/recomendaciones", kind: "primary" }],
        resultIds: items.map((c) => c.id),
        focusPropertyId: items[0]?.id,
      };
    }
  }

  // Sin cuenta: se usa lo que ya contó en la charla, o lo más popular.
  const prev = env.context.lastSlots;
  if (prev && filterCount(prev) > 0) {
    const result = await search({ ...env, slots: prev });
    if (result.blocks.length === 0) return result;
    return { ...result, lead: `Como venías mirando ${lcFirst(describeSearch(prev))}, te muestro estas.${result.lead.includes("No había exactamente") ? result.lead.slice(result.lead.indexOf(" No había")) : ""}` };
  }
  const popular = await popularCards({}, 6);
  return {
    lead: env.userId
      ? "Todavía no tengo suficiente para personalizar tus recomendaciones; esto es lo que más interés genera esta semana."
      : "Para recomendarte bien necesito conocer tus gustos: contame qué buscás (tipo, zona, presupuesto) o creá una cuenta y voy aprendiendo de lo que guardás. Mientras tanto, esto es lo que más interés genera:",
    blocks: popular.items.length > 0 ? [{ type: "cards", items: popular.items }] : [],
    followUps: dedupeSuggestions(await zoneStarters()),
    resultIds: popular.items.map((c) => c.id),
  };
};

// ─── Bajas de precio ─────────────────────────────────────────────────────────

export const priceDrops: Handler = async (env) => {
  const { slots, now } = env;
  const drops = await recentPriceDrops(slots, 6, 30);
  const scope = filterCount(slots) > 0 ? ` entre ${lcFirst(describeSearch(slots))}` : "";
  if (drops.length === 0) {
    return {
      lead: `No hay bajas de precio en los últimos 30 días${scope}. Si querés, te aviso por acá cuando aparezca alguna: guardá las que te interesen con tu cuenta y te llegará una notificación.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("explorer.new", "¿Qué hay de nuevo?"), sug("explorer.popular", "¿Cuáles son las más populares?")]),
    };
  }
  const items = drops.map((d) => ({
    ...d.card,
    reason: `Bajó ${pct(d.pct, { digits: 0 })} (de ${money(d.from, d.card.currency)} a ${money(d.to, d.card.currency)}) ${daysAgo(d.at, now)}.`,
  }));
  const biggest = [...drops].sort((a, b) => b.pct - a.pct)[0]!;
  return {
    lead: `${count(drops.length, "propiedad bajó", "propiedades bajaron")} de precio en el último mes${scope}. La baja más fuerte: ${quote(biggest.card.title)} (−${pct(biggest.pct, { digits: 0 })}).`,
    blocks: [{ type: "cards", items }],
    followUps: dedupeSuggestions([
      sug("explorer.price_check", "¿La más fuerte está bien de precio?", { slots: { propertyIds: [biggest.card.id] } }),
      ...(items.length >= 2 ? [sug("explorer.compare", "Comparar las primeras", { slots: { propertyIds: items.slice(0, 3).map((c) => c.id) } })] : []),
    ]),
    resultIds: items.map((c) => c.id),
    focusPropertyId: biggest.card.id,
    mood: biggest.pct >= 15 ? "surprised" : "neutral",
  };
};

// ─── Precio típico ───────────────────────────────────────────────────────────

export const priceTypical: Handler = async (env) => {
  const { slots } = env;
  if (!slots.zones?.length && !slots.types?.length && !slots.operation) {
    return {
      lead: "¿De qué zona y de qué tipo de propiedad querés saber el precio? Por ejemplo: “cuánto cuesta un departamento en Belgrano”.",
      blocks: [],
      followUps: dedupeSuggestions(await zoneStarters()),
    };
  }
  const stats = await priceStats(slots);
  const what = lcFirst(describeSearch({ ...slots, priceMax: undefined, priceMin: undefined, amenities: undefined }));
  const rent = slots.operation === "alquiler" || slots.operation === "alquiler_temporal";

  if (stats.n < 3) {
    return {
      lead: `Tengo muy pocas publicaciones de ${what} (${stats.n}); no alcanza para decirte un precio típico sin equivocarme. Probá con una zona o un tipo más amplio.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("explorer.search", "Ver las que hay", { slots }), ...(await zoneStarters())]),
    };
  }

  const unit = rent ? " por mes" : "";
  let lead = `${cap(what)}: el precio típico es ${money(Math.round(stats.median!), stats.currency)}${unit}, y lo más común está entre ${money(Math.round(stats.p25!), stats.currency)} y ${money(Math.round(stats.p75!), stats.currency)} (sobre ${n0(stats.n)} publicaciones).`;
  if (stats.ppmMedian && stats.ppmN >= 3) lead += ` Por m² se ubica alrededor de ${money(Math.round(stats.ppmMedian), stats.currency)}.`;
  if (stats.otherCurrency > 0) lead += ` Hay ${n0(stats.otherCurrency)} más publicadas en otra moneda que no mezclé.`;

  const blocks: AdvisorBlock[] = [
    {
      type: "metrics",
      items: [
        { label: "Precio típico", value: money(Math.round(stats.median!), stats.currency) },
        { label: "Rango frecuente", value: `${money(Math.round(stats.p25!), stats.currency)} – ${money(Math.round(stats.p75!), stats.currency)}` },
        ...(stats.ppmMedian && stats.ppmN >= 3 ? [{ label: "Por m²", value: money(Math.round(stats.ppmMedian), stats.currency) }] : []),
        { label: "Publicaciones", value: n0(stats.n) },
      ],
    },
  ];
  if (stats.n < 8) blocks.push({ type: "caveat", text: `Son pocas publicaciones (${stats.n}): tomalo como una referencia, no como el precio de mercado.` });

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([sug("explorer.search", "Ver las que hay", { slots }), sug("explorer.price_drops", "¿Alguna bajó de precio?", { slots })]),
    actions: linkActions(slots, stats.n),
  };
};

// ─── Comparar ────────────────────────────────────────────────────────────────

export const compare: Handler = async (env) => {
  const ids = (env.slots.propertyIds?.length ? env.slots.propertyIds : (env.context.resultIds ?? [])).slice(0, 3);
  const cards = ids.length >= 2 ? await loadCardsByIds(ids) : [];
  if (cards.length < 2) {
    return {
      lead: "Para comparar necesito al menos dos propiedades. Buscá algunas y después pedime “compará las dos primeras”.",
      blocks: [],
      followUps: dedupeSuggestions(await zoneStarters()),
    };
  }

  const docs = await Property.find({ _id: { $in: cards.map((c) => new Types.ObjectId(c.id)) } })
    .select("features amenities media.hasTour3d price publishedAt")
    .lean();
  const extra = new Map(docs.map((d) => [String(d._id), d]));
  const ppm = cards.map((c) => (c.area && c.area > 0 ? c.price / c.area : null));
  const sameCurrency = new Set(cards.map((c) => c.currency)).size === 1;

  const best = (values: (number | null)[], mode: "min" | "max") => {
    const valid = values.filter((v): v is number => v != null);
    if (valid.length < 2) return -1;
    const target = mode === "min" ? Math.min(...valid) : Math.max(...valid);
    return values.indexOf(target);
  };
  const cell = (value: string, tone: "good" | "neutral" = "neutral") => ({ text: value, tone });

  const cheapestPpm = sameCurrency ? best(ppm, "min") : -1;
  const biggest = best(cards.map((c) => c.area ?? null), "max");
  const rows: Record<string, string | { text: string; tone?: "good" | "bad" | "neutral" }>[] = [
    Object.fromEntries([["f", "Precio"], ...cards.map((c, i) => [`p${i}`, cell(`${money(c.price, c.currency)}${c.period === "mensual" ? "/mes" : ""}`, sameCurrency && best(cards.map((x) => x.price), "min") === i ? "good" : "neutral")])]),
    Object.fromEntries([["f", "Precio por m²"], ...cards.map((c, i) => [`p${i}`, cell(ppm[i] ? money(Math.round(ppm[i]!), c.currency) : "—", cheapestPpm === i ? "good" : "neutral")])]),
    Object.fromEntries([["f", "Superficie"], ...cards.map((c, i) => [`p${i}`, cell(c.area ? `${n0(c.area)} m²` : "—", biggest === i ? "good" : "neutral")])]),
    Object.fromEntries([["f", "Ambientes"], ...cards.map((c) => [`p${cards.indexOf(c)}`, cell(extra.get(c.id)?.features?.rooms != null ? String(extra.get(c.id)!.features!.rooms) : "—")])]),
    Object.fromEntries([["f", "Dormitorios"], ...cards.map((c, i) => [`p${i}`, cell(c.bedrooms != null ? String(c.bedrooms) : "—")])]),
    Object.fromEntries([["f", "Baños"], ...cards.map((c, i) => [`p${i}`, cell(c.bathrooms != null ? String(c.bathrooms) : "—")])]),
    Object.fromEntries([["f", "Zona"], ...cards.map((c, i) => [`p${i}`, cell(c.neighborhood ?? c.city)])]),
    Object.fromEntries([["f", "Comodidades"], ...cards.map((c, i) => [`p${i}`, cell(String(extra.get(c.id)?.amenities?.length ?? 0))])]),
    Object.fromEntries([["f", "Recorrido 360°"], ...cards.map((c, i) => [`p${i}`, cell(c.tour3d ? "Sí" : "No", c.tour3d ? "good" : "neutral")])]),
    // Sólo si alguna la tiene: si ninguna, la fila sería un "No" repetido que no ayuda a decidir.
    ...(cards.some((c) => c.ambient)
      ? [Object.fromEntries([["f", "Portada viva"], ...cards.map((c, i) => [`p${i}`, cell(c.ambient ? "Sí" : "No", c.ambient ? "good" : "neutral")])])]
      : []),
    Object.fromEntries([["f", "Inmobiliaria"], ...cards.map((c, i) => [`p${i}`, cell(c.agencyName ?? "—")])]),
  ];

  const parts: string[] = [];
  if (cheapestPpm >= 0) parts.push(`la más barata por m² es ${quote(labelOf(cards[cheapestPpm]!, cards), 44)}`);
  if (biggest >= 0 && biggest !== cheapestPpm) parts.push(`la más grande es ${quote(labelOf(cards[biggest]!, cards), 44)}`);
  const withTour = cards.filter((c) => c.tour3d);
  if (withTour.length > 0 && withTour.length < cards.length) parts.push(`${list(withTour.map((c) => quote(labelOf(c, cards), 40)))} ${plural(withTour.length, "tiene", "tienen")} recorrido 360° para ${plural(withTour.length, "verla", "verlas")} antes de ir`);

  return {
    lead: `Las puse una al lado de la otra${parts.length > 0 ? `: ${parts.join("; ")}` : ""}. No hay una “mejor” en general: depende de qué priorices.`,
    blocks: [
      {
        type: "table",
        columns: [{ key: "f", label: "" }, ...cards.map((c, i) => ({ key: `p${i}`, label: labelOf(c, cards, 28), align: "right" as const }))],
        rows,
      },
      { type: "cards", items: cards },
    ],
    followUps: dedupeSuggestions(cards.slice(0, 2).map((c) => sug("explorer.price_check", `¿${labelOf(c, cards, 30)} está bien de precio?`, { slots: { propertyIds: [c.id] } }))),
    resultIds: cards.map((c) => c.id),
    focusPropertyId: cards[0]!.id,
  };
};

// ─── ¿Está bien de precio? ───────────────────────────────────────────────────

export const priceCheck: Handler = async (env) => {
  const id = env.slots.propertyIds?.[0] ?? env.context.focusPropertyId ?? env.context.resultIds?.[0];
  const card = id ? (await loadCardsByIds([id]))[0] : undefined;
  if (!card) {
    return {
      lead: "¿De cuál propiedad querés saber? Abrí su ficha o buscá algunas y elegí una: la comparo con el resto de las del mercado.",
      blocks: [],
      followUps: dedupeSuggestions(await zoneStarters()),
    };
  }

  const doc = await Property.findById(card.id).select("price features.coveredArea features.totalArea address").lean();
  const area = doc?.features?.coveredArea ?? doc?.features?.totalArea ?? null;
  const ownPpm = area && area > 0 ? card.price / area : null;

  // Comparables: mismo tipo y operación; primero el mismo barrio, si no alcanzan, la ciudad.
  const base: Slots = { types: [card.type as never], operation: card.operation as never };
  let scopeLabel = card.neighborhood ?? card.city;
  let stats = await priceStats({ ...base, zones: card.neighborhood ? [card.neighborhood] : [card.city] }, card.id);
  if (stats.n < 5 && card.neighborhood) {
    stats = await priceStats({ ...base, zones: [card.city] }, card.id);
    scopeLabel = card.city;
  }
  const what = `${typeLabel(card.type)} ${operationText(card.operation as never)} en ${scopeLabel}`;

  if (stats.currency !== card.currency || stats.n < 5) {
    return {
      lead: `No tengo suficientes ${what} comparables (hay ${stats.n}) para decirte si ${quote(card.title)} está bien de precio sin equivocarme.`,
      blocks: [{ type: "cards", items: [card] }],
      followUps: dedupeSuggestions([sug("explorer.price_typical", `¿Cuánto cuesta en ${scopeLabel}?`, { slots: { ...base, zones: [scopeLabel] } })]),
      focusPropertyId: card.id,
    };
  }

  // Por m² si hay superficie; si no, precio total.
  const useM2 = ownPpm != null && stats.ppmN >= 5 && stats.ppmMedian != null && stats.ppmP25 != null && stats.ppmP75 != null;
  const value = useM2 ? ownPpm! : card.price;
  const med = useM2 ? stats.ppmMedian! : stats.median!;
  const p25 = useM2 ? stats.ppmP25! : stats.p25!;
  const p75 = useM2 ? stats.ppmP75! : stats.p75!;
  const diff = change(value, med)!;
  const fmt = (v: number) => `${money(Math.round(v), card.currency)}${useM2 ? "/m²" : ""}`;

  let verdict: string;
  let tone: "good" | "bad" | "neutral" = "neutral";
  if (value < p25) {
    verdict = `está por debajo del rango habitual (${pct(Math.abs(diff), { digits: 0 })} menos que la mediana)`;
    tone = "good";
  } else if (value > p75) {
    verdict = `está por encima del rango habitual (${pct(Math.abs(diff), { digits: 0 })} más que la mediana)`;
    tone = "bad";
  } else {
    verdict = `está dentro del rango habitual (${diff >= 0 ? "+" : "−"}${pct(Math.abs(diff), { digits: 0 })} respecto de la mediana)`;
  }

  return {
    lead: `Comparada con ${count(stats.n, "propiedad parecida", "propiedades parecidas")} (${what}), ${quote(card.title)} ${verdict}: ${fmt(value)} contra ${fmt(med)} de mediana. Es una referencia estadística, no una tasación: el estado, la vista y la ubicación exacta también pesan.`,
    blocks: [
      { type: "cards", items: [card] },
      {
        type: "metrics",
        items: [
          { label: useM2 ? "Esta propiedad (m²)" : "Esta propiedad", value: fmt(value), tone },
          { label: "Mediana", value: fmt(med) },
          { label: "Rango habitual", value: `${fmt(p25)} – ${fmt(p75)}` },
        ],
      },
    ],
    followUps: dedupeSuggestions([
      sug("explorer.search", `Ver otras ${typeLabel(card.type)} en ${scopeLabel}`, { slots: { types: [card.type as never], zones: [scopeLabel], operation: card.operation as never } }),
      sug("explorer.price_drops", "¿Alguna bajó de precio?", { slots: { types: [card.type as never], zones: [scopeLabel] } }),
    ]),
    resultIds: [card.id],
    focusPropertyId: card.id,
  };
};

// ─── Con recorrido 360°, novedades, populares ────────────────────────────────

export const withTour: Handler = async (env) => {
  const result = await search({ ...env, slots: { ...env.slots, withTour: true } });
  if (result.blocks.length === 0) return result;
  return { ...result, lead: `${result.lead} Con el recorrido 360° podés caminarlas desde acá antes de visitarlas.` };
};

export const withAmbient: Handler = async (env) => {
  const result = await search({ ...env, slots: { ...env.slots, withAmbient: true } });
  if (result.blocks.length === 0) {
    return {
      ...result,
      lead: `Por ahora no hay propiedades publicadas con portada viva${filterCount(env.slots) > 0 ? " con esos filtros" : ""}. Es una portada que se ve de día, de noche, con lluvia y con viento, y las inmobiliarias la van sumando.`,
    };
  }
  return { ...result, lead: `${result.lead} Su portada cambia de día a noche, con lluvia y con viento: entrá a la ficha para verla en vivo.` };
};

export const newest: Handler = async (env) => {
  const days = env.slots.period === "today" ? 1 : env.slots.period === "yesterday" ? 2 : env.slots.period === "month" ? 30 : 7;
  const res = await newestCards(env.slots, days, 6);
  const when = days === 1 ? "hoy" : days === 30 ? "en el último mes" : `en los últimos ${days} días`;
  if (res.total === 0) {
    return {
      lead: `No se publicó nada nuevo ${when}${filterCount(env.slots) > 0 ? " con esos filtros" : ""}. Te muestro lo más popular mientras tanto.`,
      blocks: await popularCards(env.slots, 4).then((p) => (p.items.length ? [{ type: "cards" as const, items: p.items }] : [])),
      followUps: dedupeSuggestions([sug("explorer.popular", "¿Cuáles son las más populares?")]),
    };
  }
  return {
    lead: `${cap(when)} se publicaron ${count(res.total, "propiedad", "propiedades")}${filterCount(env.slots) > 0 ? ` de ${lcFirst(describeSearch(env.slots))}` : ""}. Las más nuevas:`,
    blocks: [{ type: "cards", items: res.items }],
    followUps: dedupeSuggestions(followUpsFor(env.slots, res.items)),
    actions: linkActions(env.slots, res.total),
    resultIds: res.items.map((c) => c.id),
    focusPropertyId: res.items[0]?.id,
  };
};

export const popular: Handler = async (env) => {
  const res = await popularCards(env.slots, 6);
  if (res.items.length === 0) {
    return {
      lead: "Todavía no hay suficiente actividad esta semana para armar un ranking de populares. Te dejo las más nuevas:",
      blocks: await newestCards(env.slots, 14, 4).then((n) => (n.items.length ? [{ type: "cards" as const, items: n.items }] : [])),
      followUps: dedupeSuggestions(await zoneStarters()),
    };
  }
  return {
    lead: `Esto es lo que más se ve, se guarda y se consulta esta semana${filterCount(env.slots) > 0 ? ` entre ${lcFirst(describeSearch(env.slots))}` : ""}.`,
    blocks: [{ type: "cards", items: res.items }],
    followUps: dedupeSuggestions(followUpsFor(env.slots, res.items)),
    resultIds: res.items.map((c) => c.id),
    focusPropertyId: res.items[0]?.id,
  };
};

// ─── Inmobiliarias ───────────────────────────────────────────────────────────

export const agencies: Handler = async (env) => {
  const found = await agenciesByZone(env.slots, 6);
  const where = env.slots.zones?.length ? ` en ${list(env.slots.zones)}` : "";
  if (found.length === 0) {
    return {
      lead: `No encontré inmobiliarias con propiedades publicadas${where}.`,
      blocks: [],
      followUps: dedupeSuggestions(await zoneStarters()),
    };
  }
  return {
    lead: `${count(found.length, "inmobiliaria publica", "inmobiliarias publican")}${where}; la que más propiedades tiene es ${found[0]!.name} (${n0(found[0]!.count)}). Tocá una para ver su perfil y sus propiedades.`,
    blocks: [
      {
        type: "bars",
        items: found.map((a) => ({ label: a.name, value: a.count, valueText: `${a.count} ${plural(a.count, "propiedad", "propiedades")}`, href: `/inmobiliarias/${a.slug}` })),
      },
    ],
    followUps: dedupeSuggestions([sug("explorer.search", `Ver propiedades${where}`, { slots: env.slots })]),
  };
};

