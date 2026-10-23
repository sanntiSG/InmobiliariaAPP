/**
 * Handlers de comparación: zonas, tipos de propiedad, qué tienen en común las
 * que mejor funcionan y propiedades de precio parecido con distinto interés.
 * Siempre comparan por publicación (no por total) y avisan cuando los datos no
 * alcanzan para afirmar algo.
 */
import { benchFor } from "@/lib/intelligence/benchmarks";
import { THRESHOLDS } from "@/lib/intelligence/diagnostics";
import { consultas } from "@/lib/intelligence/metrics";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { change, count, list, mean, median, money, n0, n1, pct, plural, quote, signedPct } from "../../compose/format";
import type { PropertyRow } from "../../data/portfolio";
import type { AdvisorBlock, MetricId, SuggestionQuery, TableCell } from "../../types";
import type { AgencyHandler } from "../types";
import { MIN_VIEWS, THIN_DATA_TEXT, filterRows, hasThinData, metricValue, propRef, typeGender, typeLabel, zoneOf } from "./shared";

const REST_LABEL = "El resto de tus zonas";
const zoneName = (key: string) => (key === REST_LABEL ? "el resto de tus zonas" : key);

type Group = {
  key: string;
  rows: PropertyRow[];
  views: number;
  consultas: number;
  saves: number;
  score: number;
};

function summarize(key: string, rows: PropertyRow[]): Group {
  return {
    key,
    rows,
    views: rows.reduce((a, r) => a + r.d30.views, 0),
    consultas: rows.reduce((a, r) => a + consultas(r.d30), 0),
    saves: rows.reduce((a, r) => a + r.d30.saves, 0),
    score: rows.reduce((a, r) => a + r.score, 0),
  };
}

const perProp = (g: Group, v: number) => v / Math.max(1, g.rows.length);
const rate = (g: Group) => (g.views > 0 ? g.consultas / g.views : null);

/** ¿Hay datos suficientes en el grupo para hablar de tasas? */
const enough = (g: Group) => g.views >= MIN_VIEWS;

function groupBy(rows: PropertyRow[], key: (r: PropertyRow) => string): Group[] {
  const map = new Map<string, PropertyRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map].map(([k, v]) => summarize(k, v));
}

const medianPpm = (rows: PropertyRow[]) => median(rows.filter((r) => r.pricePerM2).map((r) => r.pricePerM2!));

// ─── Zonas ───────────────────────────────────────────────────────────────────

export const compareZones: AgencyHandler = (env) => {
  const { portfolio: p, slots } = env;
  // Los filtros de tipo/operación se aplican; las zonas se usan para elegir qué comparar, no para filtrar.
  const pool = filterRows(p.rows, { ...slots, zones: undefined });
  if (pool.length === 0) {
    return { lead: "No encuentro propiedades publicadas con esos filtros para comparar zonas.", blocks: [], followUps: [sug("agency.overview", "Dame un resumen general")] };
  }

  const all = groupBy(pool, (r) => zoneOf(r));
  const wanted = (slots.zones ?? []).map((z) => z.toLowerCase());
  let groups = wanted.length > 0 ? all.filter((g) => wanted.includes(g.key.toLowerCase())) : all;
  let restLabel: string | null = null;

  // Una sola zona: se la compara contra el resto de la cartera.
  if (groups.length === 1 && wanted.length === 1) {
    const rest = pool.filter((r) => zoneOf(r).toLowerCase() !== wanted[0]);
    if (rest.length > 0) {
      restLabel = REST_LABEL;
      groups = [...groups, summarize(restLabel, rest)];
    }
  }
  if (groups.length === 0) {
    return {
      lead: `No tengo propiedades publicadas en ${list(slots.zones ?? [])} entre las tuyas. Tus zonas son: ${list(all.slice(0, 6).map((g) => g.key))}.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.compare_zones", "Comparar todas mis zonas")]),
    };
  }

  groups = groups.sort((a, b) => b.score / b.rows.length - a.score / a.rows.length).slice(0, 8);
  const typeText = slots.types?.length ? ` (${slots.types.map((t) => typeLabel(t)).join(" y ")})` : "";

  const columns = [
    { key: "zone", label: "Zona" },
    { key: "n", label: "Props", align: "right" as const },
    { key: "views", label: "Visitas c/u", align: "right" as const },
    { key: "cons", label: "Consultas c/u", align: "right" as const },
    { key: "rate", label: "Tasa", align: "right" as const },
    { key: "ppm", label: "Precio m²", align: "right" as const },
  ];
  const bestViews = Math.max(...groups.map((g) => perProp(g, g.views)));
  const rows = groups.map((g) => {
    const r = rate(g);
    const ppm = medianPpm(g.rows);
    const cur = g.rows.find((x) => x.pricePerM2)?.currency ?? "USD";
    const cells: Record<string, TableCell> = {
      zone: g.key,
      n: g.rows.length,
      views: { text: n1(perProp(g, g.views)), tone: groups.length > 1 && perProp(g, g.views) === bestViews && bestViews > 0 ? "good" : "neutral" },
      cons: n1(perProp(g, g.consultas)),
      rate: enough(g) && r != null ? pct(r, { fromRatio: true }) : "—",
      ppm: ppm ? money(ppm, cur) : "—",
    };
    return cells;
  });

  const blocks: AdvisorBlock[] = [{ type: "table", caption: `Por publicación, últimos 30 días${typeText}`, columns, rows }];
  const lead: string[] = [];

  if (groups.length >= 2) {
    const [a, b] = groups;
    const aViews = perProp(a!, a!.views);
    const bViews = perProp(b!, b!.views);
    const aCons = perProp(a!, a!.consultas);
    const bCons = perProp(b!, b!.consultas);
    const thin = !enough(a!) || !enough(b!);

    if (a!.views + b!.views === 0) {
      lead.push(`Ni ${a!.key} ni ${b!.key} tienen visitas medidas en los últimos 30 días, así que no puedo compararlas todavía.`);
    } else {
      // Se compara por consultas; si ambas están igual (por ejemplo, las dos en cero) no hay nada que explicar ahí y se mira el interés.
      const byViews = Math.abs(aCons - bCons) < 0.05;
      const leaderCons = (byViews ? aViews >= bViews : aCons >= bCons) ? a! : b!;
      const other = leaderCons === a ? b! : a!;
      if (byViews) {
        const dViews = change(perProp(leaderCons, leaderCons.views), perProp(other, other.views));
        lead.push(
          `Las consultas por publicación son iguales en ${zoneName(a!.key)} y ${zoneName(b!.key)} (${n1(aCons)}), así que no hay una diferencia de consultas para explicar. En visitas, ${zoneName(leaderCons.key)} recibe ${n1(perProp(leaderCons, leaderCons.views))} contra ${n1(perProp(other, other.views))} en ${zoneName(other.key)}${dViews != null && perProp(other, other.views) > 0 ? ` (${signedPct(dViews, 0)})` : ""}.`
        );
      } else {
        const dCons = change(perProp(leaderCons, leaderCons.consultas), perProp(other, other.consultas));
        lead.push(
          `Por publicación, ${zoneName(leaderCons.key)} recibe ${n1(perProp(leaderCons, leaderCons.consultas))} consultas contra ${n1(perProp(other, other.consultas))} en ${zoneName(other.key)}${dCons != null && perProp(other, other.consultas) > 0 ? ` (${signedPct(dCons, 0)})` : ""}.`
        );
      }
      // Posibles factores: sólo diferencias reales y medibles entre ambas zonas.
      const factors = explainGap(leaderCons, other);
      if (factors.length > 0) {
        lead.push(`Lo que más las diferencia: ${list(factors.slice(0, 3))}.`);
        blocks.push({ type: "caveat", text: "Son diferencias entre las dos zonas que pueden estar influyendo, no una prueba de causa." });
      } else if (!thin) {
        lead.push("No veo diferencias claras de precio, fotos o contenido entre ambas; puede ser demanda propia de cada zona.");
      }
      if (thin) {
        blocks.push({ type: "caveat", text: `Alguna de las zonas tiene menos de ${MIN_VIEWS} visitas en 30 días: la comparación es orientativa.` });
      }
    }
  } else {
    lead.push(`En ${groups[0]!.key} tenés ${count(groups[0]!.rows.length, "propiedad", "propiedades")} con ${n0(groups[0]!.views)} visitas en 30 días.`);
  }
  if (hasThinData(env)) blocks.push({ type: "caveat", text: THIN_DATA_TEXT });

  const followUps: SuggestionQuery[] = [];
  const target = groups[0];
  if (target) followUps.push(sug("agency.worst", `¿Qué propiedades de ${target.key} rinden menos?`, { slots: { zones: [target.key] } }));
  followUps.push(sug("agency.type_interest", "¿Qué tipo de propiedad rinde más?"));
  followUps.push(sug("agency.actions", "¿Qué me recomendás hacer?"));

  return {
    lead: lead.join(" "),
    blocks,
    followUps: dedupeSuggestions(followUps),
    resultIds: groups.flatMap((g) => g.rows.slice(0, 2).map((r) => r.id)).slice(0, 6),
  };
};

/** Diferencias medibles entre la zona que rinde más (a) y la que rinde menos (b), de la más grande a la más chica. */
function explainGap(a: Group, b: Group): string[] {
  const out: { score: number; text: string }[] = [];
  const ppmA = medianPpm(a.rows);
  const ppmB = medianPpm(b.rows);
  const curA = a.rows.find((r) => r.pricePerM2)?.currency;
  const curB = b.rows.find((r) => r.pricePerM2)?.currency;
  if (ppmA && ppmB && curA === curB) {
    const d = change(ppmB, ppmA);
    if (d != null && Math.abs(d) >= 15) {
      out.push({ score: Math.abs(d), text: `el precio por m² en ${zoneName(b.key)} es ${pct(Math.abs(d), { digits: 0 })} ${d > 0 ? "más alto" : "más bajo"} que en ${zoneName(a.key)}` });
    }
  }
  const imgA = mean(a.rows.map((r) => r.images));
  const imgB = mean(b.rows.map((r) => r.images));
  if (imgA != null && imgB != null && imgA - imgB >= 2) {
    out.push({ score: (imgA - imgB) * 8, text: `en ${zoneName(b.key)} hay menos fotos por publicación (${n1(imgB)} contra ${n1(imgA)})` });
  }
  const tourA = a.rows.filter((r) => r.hasTour).length / a.rows.length;
  const tourB = b.rows.filter((r) => r.hasTour).length / b.rows.length;
  if (tourA - tourB >= 0.3) {
    out.push({ score: (tourA - tourB) * 60, text: `${n0(tourB * 100)} % de las de ${zoneName(b.key)} tiene recorrido 360° contra ${n0(tourA * 100)} % en ${zoneName(a.key)}` });
  }
  const ambientA = a.rows.filter((r) => r.hasAmbientCover).length / a.rows.length;
  const ambientB = b.rows.filter((r) => r.hasAmbientCover).length / b.rows.length;
  if (ambientA - ambientB >= 0.3) {
    out.push({ score: (ambientA - ambientB) * 40, text: `${n0(ambientB * 100)} % de las de ${zoneName(b.key)} tiene portada viva contra ${n0(ambientA * 100)} % en ${zoneName(a.key)}` });
  }
  const descA = mean(a.rows.map((r) => r.descriptionLength));
  const descB = mean(b.rows.map((r) => r.descriptionLength));
  if (descA != null && descB != null && descA > 0 && descB / descA < 0.7) {
    out.push({ score: (1 - descB / descA) * 40, text: `las descripciones de ${zoneName(b.key)} son más cortas (${n0(descB)} contra ${n0(descA)} caracteres)` });
  }
  return out.sort((x, y) => y.score - x.score).map((o) => o.text);
}

// ─── Tipo de propiedad ───────────────────────────────────────────────────────

export const typeInterest: AgencyHandler = (env) => {
  const { portfolio: p, slots } = env;
  const pool = filterRows(p.rows, { ...slots, types: undefined });
  const groups = groupBy(pool, (r) => r.type).sort((a, b) => b.score / b.rows.length - a.score / a.rows.length);

  if (groups.length === 0) {
    return { lead: "No tengo propiedades publicadas para comparar tipos.", blocks: [], followUps: [sug("agency.overview", "Dame un resumen general")] };
  }
  if (groups.length === 1) {
    const g = groups[0]!;
    return {
      lead: `Todas tus propiedades publicadas son ${typeLabel(g.key)}: no hay otro tipo con el cual compararlas todavía.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.compare_zones", "¿Cómo me va por zona?")]),
    };
  }

  const top = groups[0]!;
  const second = groups[1]!;
  const dTop = change(top.score / top.rows.length, second.score / second.rows.length);
  const dataThin = top.views < MIN_VIEWS || second.views < MIN_VIEWS;

  const art = typeGender(top.key);
  let lead = `Por publicación, ${art.the} ${typeLabel(top.key)} generan más interés: ${n1(perProp(top, top.views))} visitas y ${n1(perProp(top, top.consultas))} consultas ${art.each}${
    second ? `, contra ${n1(perProp(second, second.views))} y ${n1(perProp(second, second.consultas))} de ${typeGender(second.key).the} ${typeLabel(second.key)}` : ""
  }.`;
  if (dTop != null && second.score > 0 && dTop >= 30) lead += ` Tienen un ${pct(Math.abs(dTop), { digits: 0 })} más de interés por propiedad.`;
  if (top.rows.length === 1) lead += ` Ojo: tenés una sola publicación de ese tipo, así que puede ser un caso puntual.`;

  const columns = [
    { key: "type", label: "Tipo" },
    { key: "n", label: "Props", align: "right" as const },
    { key: "views", label: "Visitas c/u", align: "right" as const },
    { key: "cons", label: "Consultas c/u", align: "right" as const },
    { key: "saves", label: "Favoritos c/u", align: "right" as const },
  ];
  const rows = groups.map((g, i) => ({
    type: typeLabel(g.key),
    n: g.rows.length,
    views: { text: n1(perProp(g, g.views)), tone: i === 0 ? ("good" as const) : ("neutral" as const) },
    cons: n1(perProp(g, g.consultas)),
    saves: n1(perProp(g, g.saves)),
  }));

  const blocks: AdvisorBlock[] = [
    { type: "table", caption: "Por publicación, últimos 30 días", columns, rows },
    {
      type: "bars",
      items: groups.map((g) => ({ label: typeLabel(g.key), value: Math.round((g.score / g.rows.length) * 10) / 10, valueText: `${n1(g.score / g.rows.length)} pts`, sublabel: `${g.rows.length} ${plural(g.rows.length, "publicación", "publicaciones")}` })),
    },
  ];
  if (dataThin) blocks.push({ type: "caveat", text: `Alguno de los tipos tiene menos de ${MIN_VIEWS} visitas en 30 días: tomalo como una tendencia, no como una conclusión.` });
  if (hasThinData(env)) blocks.push({ type: "caveat", text: THIN_DATA_TEXT });

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.worst", `¿Cuáles de mis ${typeLabel(second.key)} rinden menos?`, { slots: { types: [second.key as never] } }),
      sug("agency.traits", "¿Qué tienen en común las que mejor funcionan?"),
      sug("agency.compare_zones", "¿Cómo me va por zona?"),
    ]),
    resultIds: top.rows.slice(0, 3).map((r) => r.id),
  };
};

// ─── Qué tienen en común las que mejor funcionan ─────────────────────────────

export const traits: AgencyHandler = (env) => {
  const { portfolio: p, slots } = env;
  const metric: MetricId = slots.metric && slots.metric !== "conversion" ? slots.metric : "saves";
  const pool = filterRows(p.rows, slots).filter((r) => r.d30.views > 0 || metricValue(r.d30, metric) > 0);

  const metricName = metric === "saves" ? "favoritos" : metric === "inquiries" ? "consultas" : metric === "views" ? "visitas" : metric === "interest" ? "interés" : metric === "likes" ? "me gusta" : "interés";
  if (pool.length < 4) {
    return {
      lead: `Necesito al menos 4 propiedades con actividad para separar las que más ${metricName} reciben de las que menos y compararlas; ahora tengo ${pool.length}. Cuando haya más datos lo armo.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.best", "¿Cuáles funcionan mejor?"), sug("agency.actions", "¿Qué me recomendás hacer?")]),
    };
  }

  const ranked = [...pool].sort((a, b) => metricValue(b.d30, metric) - metricValue(a.d30, metric) || b.d30.views - a.d30.views);
  const half = Math.max(2, Math.floor(ranked.length / 2));
  const top = ranked.slice(0, half);
  const rest = ranked.slice(-half);
  if (metricValue(top[0]!.d30, metric) === metricValue(rest[rest.length - 1]!.d30, metric)) {
    return {
      lead: `Todas tus propiedades tienen la misma cantidad de ${metricName}, así que no hay una diferencia que explicar.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.actions", "¿Qué me recomendás hacer?")]),
    };
  }

  type Row = { factor: string; a: number | null; b: number | null; fmt: (v: number) => string; high: boolean };
  const avg = (rows: PropertyRow[], f: (r: PropertyRow) => number | null) => mean(rows.map(f).filter((v): v is number => v != null));
  const shareOf = (rows: PropertyRow[], f: (r: PropertyRow) => boolean) => (rows.length ? (rows.filter(f).length / rows.length) * 100 : 0);
  const rowsOut: Row[] = [
    { factor: "Fotos", a: avg(top, (r) => r.images), b: avg(rest, (r) => r.images), fmt: n1, high: true },
    { factor: "Largo de la descripción", a: avg(top, (r) => r.descriptionLength), b: avg(rest, (r) => r.descriptionLength), fmt: (v) => `${n0(v)} car.`, high: true },
    { factor: "Con recorrido 360°", a: shareOf(top, (r) => r.hasTour), b: shareOf(rest, (r) => r.hasTour), fmt: (v) => `${n0(v)} %`, high: true },
    { factor: "Con video", a: shareOf(top, (r) => r.videos > 0), b: shareOf(rest, (r) => r.videos > 0), fmt: (v) => `${n0(v)} %`, high: true },
    // Sólo si alguna la usa: para una inmobiliaria sin portada viva la fila sería "0 % contra 0 %" y no dice nada.
    ...(pool.some((r) => r.hasAmbientCover)
      ? [{ factor: "Con portada viva", a: shareOf(top, (r) => r.hasAmbientCover), b: shareOf(rest, (r) => r.hasAmbientCover), fmt: (v: number) => `${n0(v)} %`, high: true }]
      : []),
    { factor: "Comodidades", a: avg(top, (r) => r.amenities.length), b: avg(rest, (r) => r.amenities.length), fmt: n1, high: true },
    {
      factor: "Precio por m²",
      a: avg(top.filter((r) => r.currency === top[0]!.currency), (r) => r.pricePerM2),
      b: avg(rest.filter((r) => r.currency === top[0]!.currency), (r) => r.pricePerM2),
      fmt: (v) => money(v, top[0]!.currency),
      high: false,
    },
    {
      factor: "Días publicada",
      a: avg(top, (r) => (r.publishedAt ? (env.now.getTime() - r.publishedAt.getTime()) / 86_400_000 : null)),
      b: avg(rest, (r) => (r.publishedAt ? (env.now.getTime() - r.publishedAt.getTime()) / 86_400_000 : null)),
      fmt: (v) => n0(v),
      high: false,
    },
  ];

  const relevant = rowsOut
    .filter((r) => r.a != null && r.b != null)
    .map((r) => ({ r, d: r.b === 0 ? (r.a! > 0 ? 100 : 0) : ((r.a! - r.b!) / r.b!) * 100 }));
  const notable = relevant.filter((x) => Math.abs(x.d) >= 25).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

  const rows = relevant.map(({ r, d }) => ({
    factor: r.factor,
    top: { text: r.fmt(r.a!), tone: Math.abs(d) >= 25 && r.high ? (d > 0 ? ("good" as const) : ("bad" as const)) : ("neutral" as const) },
    rest: r.fmt(r.b!),
  }));

  const topNames = list(top.slice(0, 2).map((r) => quote(r.title, 36)));
  let lead = `Separé tus ${pool.length} propiedades con actividad entre las ${half} que más ${metricName} reciben (${topNames}…) y las ${half} que menos.`;
  if (notable.length > 0) {
    const phrases = notable.slice(0, 3).map(({ r, d }) => `${r.factor.toLowerCase()}: ${r.fmt(r.a!)} contra ${r.fmt(r.b!)} (${signedPct(d, 0)})`);
    lead += ` Lo que más cambia: ${list(phrases)}.`;
  } else {
    lead += " No encuentro diferencias marcadas en fotos, descripción, recorrido o precio entre ambos grupos.";
  }

  const blocks: AdvisorBlock[] = [
    {
      type: "table",
      caption: `Más ${metricName} vs. menos ${metricName} (promedios)`,
      columns: [
        { key: "factor", label: "Característica" },
        { key: "top", label: `Las ${half} que más`, align: "right" },
        { key: "rest", label: `Las ${half} que menos`, align: "right" },
      ],
      rows,
    },
    { type: "caveat", text: `Con ${pool.length} propiedades son patrones para tener en cuenta, no reglas: una sola publicación puede cambiar el resultado.` },
  ];

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.promote", "¿Cuáles conviene promocionar?"),
      sug("agency.photos", "¿Cuáles necesitan mejores fotos?"),
      sug("agency.actions", "¿Qué me recomendás hacer?"),
    ]),
    resultIds: top.slice(0, 5).map((r) => r.id),
  };
};

// ─── Precios similares, distinto interés ─────────────────────────────────────

export const similarPrice: AgencyHandler = (env) => {
  const { portfolio: p, slots } = env;
  const pool = filterRows(p.rows, slots).filter((r) => r.price > 0);

  // Bandas de ±10 % dentro del mismo tipo, operación y moneda.
  type Cluster = { rows: PropertyRow[]; key: string };
  const clusters: Cluster[] = [];
  const groups = new Map<string, PropertyRow[]>();
  for (const r of pool) {
    const k = `${r.type}:${r.operation}:${r.currency}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.price - b.price);
    let current: PropertyRow[] = [];
    for (const r of sorted) {
      if (current.length === 0 || r.price <= current[0]!.price * 1.1) current.push(r);
      else {
        if (current.length >= 2) clusters.push({ rows: current, key });
        current = [r];
      }
    }
    if (current.length >= 2) clusters.push({ rows: current, key });
  }

  const gaps = clusters
    .map((c) => {
      const sorted = [...c.rows].sort((a, b) => b.score - a.score);
      const hi = sorted[0]!;
      const lo = sorted[sorted.length - 1]!;
      return { c, hi, lo, spread: hi.score - lo.score };
    })
    // Sólo cuenta si la que más recibe tiene volumen suficiente y la diferencia es grande.
    .filter((g) => g.hi.d30.views >= 20 && g.hi.score >= Math.max(10, g.lo.score * 2))
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 3);

  if (gaps.length === 0) {
    return {
      lead: pool.length < 2
        ? "Necesito al menos dos propiedades del mismo tipo y precio parecido para compararlas."
        : "No encuentro propiedades de precio parecido (±10 %) con una diferencia grande de interés entre ellas, o todavía hay pocas visitas para afirmarlo.",
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.traits", "¿Qué tienen en común las que mejor funcionan?"), sug("agency.compare_zones", "¿Cómo me va por zona?")]),
    };
  }

  const blocks: AdvisorBlock[] = [];
  const ids: string[] = [];
  for (const { c, hi, lo } of gaps) {
    const bench = benchFor(p.bench, hi.type, hi.operation);
    void bench;
    const diffs: string[] = [];
    if (hi.images - lo.images >= 3) diffs.push(`${hi.images} fotos contra ${lo.images}`);
    if (hi.hasTour && !lo.hasTour) diffs.push("tiene recorrido 360° y la otra no");
    if (hi.hasAmbientCover && !lo.hasAmbientCover) diffs.push("tiene portada viva y la otra no");
    if (hi.videos > 0 && lo.videos === 0) diffs.push("tiene video y la otra no");
    if (lo.descriptionLength < THRESHOLDS.minDescription && hi.descriptionLength >= THRESHOLDS.minDescription) diffs.push("la otra tiene una descripción muy corta");
    const low = Math.min(...c.rows.map((r) => r.price));
    const high = Math.max(...c.rows.map((r) => r.price));
    blocks.push({
      type: "properties",
      title: `${typeLabel(hi.type)} de ${money(low, hi.currency)} a ${money(high, hi.currency)}`,
      items: [
        propRef(hi, env, { chips: [`${n0(hi.d30.views)} visitas`, `${n0(consultas(hi.d30))} consultas`], tone: "good", note: "La que más interés recibe." , auto: false }),
        propRef(lo, env, {
          chips: [`${n0(lo.d30.views)} visitas`, `${n0(consultas(lo.d30))} consultas`],
          tone: "bad",
          note: diffs.length > 0 ? `Diferencias: ${diffs.join("; ")}.` : "No veo una diferencia evidente en fotos o contenido.",
          auto: false,
        }),
      ],
    });
    ids.push(hi.id, lo.id);
  }

  const lead = `Encontré ${count(gaps.length, "grupo", "grupos")} de propiedades con precio casi igual y un interés muy distinto. Cuando el precio no explica la diferencia, suele pesar la presentación: fotos, descripción, recorrido o video.`;
  blocks.push({ type: "caveat", text: "Son diferencias que pueden estar influyendo, no una prueba de causa." });

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar la que menos recibe", { slots: { propertyIds: gaps.map((g) => g.lo.id) }, tone: "warn" }),
      sug("agency.photos", "¿Cuáles necesitan mejores fotos?"),
    ]),
    resultIds: ids,
    focusPropertyId: gaps[0]!.lo.id,
  };
};

