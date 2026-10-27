/**
 * Handlers de mejora: acciones recomendadas, fotos, publicaciones
 * incompletas, propiedades sin consultas, oportunidades sin aprovechar y qué
 * promocionar. Las recomendaciones salen de los hallazgos que el panel ya
 * calcula (`getIntelligence`); acá se agrupan, se priorizan y se explican.
 */
import { benchFor } from "@/lib/intelligence/benchmarks";
import { THRESHOLDS } from "@/lib/intelligence/diagnostics";
import { consultas, ratio } from "@/lib/intelligence/metrics";
import { groupDiagnostics, ruleOf } from "@/lib/agents/knowledge/diagnostics";
import { rankForPromotion, promotionNote } from "@/lib/agents/knowledge/promote";
import { loadPromotedDaysAgo } from "@/lib/agents/knowledge/promoted";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { phrase } from "@/lib/agents/knowledge/phrasing";
import { count, daysAgo, list, n0, plural, quote } from "../../compose/format";
import type { PropertyRow } from "../../data/portfolio";
import type { AdvisorBlock, SuggestionQuery } from "../../types";
import type { AgencyHandler } from "../types";
import { DEFAULT_LIST, MAX_LIST, MIN_VIEWS, editHref, filterRows, hasThinData, propRef, THIN_DATA_TEXT } from "./shared";

const DAY_MS = 86_400_000;
const limitOf = (n: number | undefined, fallback = DEFAULT_LIST) => Math.min(MAX_LIST, Math.max(1, n ?? fallback));

// ─── Acciones recomendadas ───────────────────────────────────────────────────

export const actions: AgencyHandler = (env) => {
  const { portfolio: p, now } = env;
  const n = limitOf(env.slots.count, 3);
  const pool = new Set(filterRows(p.rows, env.slots).map((r) => r.id));
  const scoped = env.slots.zones?.length || env.slots.types?.length || env.slots.operation;

  const candidates = p.intel.opportunities.filter(
    (d) => d.kind !== "positive" && (!scoped || !d.propertyId || pool.has(d.propertyId))
  );
  const items = groupDiagnostics(candidates, n);

  // Sin ningún movimiento en 30 días, la propia inactividad es una pista.
  const lastActivity = p.activity.find((e) => e.kind === "property_updated" || e.kind === "property_created");
  const idle = !lastActivity || now.getTime() - lastActivity.at.getTime() > 30 * DAY_MS;
  if (items.length < n && idle && p.rows.length > 0) {
    items.push({
      id: "idle-30d",
      kind: "opportunity",
      severity: "low",
      title: "Hace tiempo que no actualizás tus publicaciones",
      explanation: lastActivity
        ? `Tu último cambio fue ${daysAgo(lastActivity.at, now)}. Renovar fotos, texto o precio vuelve a darle visibilidad a cada propiedad.`
        : "No registro cambios recientes. Renovar fotos, texto o precio vuelve a darle visibilidad a cada propiedad.",
      action: "Elegí una propiedad con pocas visitas y renovale las fotos o la descripción.",
      href: "/dashboard/propiedades",
      evidence: [],
    });
  }

  if (items.length === 0) {
    return {
      lead: phrase(
        "agency.actions.none",
        [
          "No encuentro nada que pida acción: tus propiedades no tienen hallazgos pendientes. Seguí publicando y mirando cómo evolucionan las visitas.",
          "Por ahora no hay nada que pida acción: ninguna propiedad tiene hallazgos pendientes. Seguí publicando y mirando cómo evolucionan las visitas.",
          "Todo en orden: no hay hallazgos pendientes en tus propiedades. Lo mejor ahora es seguir publicando y mirar cómo evolucionan las visitas.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.best", "¿Cuáles funcionan mejor?"), sug("agency.promote", "¿Cuáles conviene promocionar?")]),
    };
  }

  const lead = `Estas son las ${items.length === 1 ? "acción" : `${items.length} acciones`} que más pueden mover tus resultados ahora, ordenadas por impacto: ${items
    .map((d, i) => `${i + 1}) ${d.title.charAt(0).toLowerCase()}${d.title.slice(1)}`)
    .join("; ")}.`;

  return {
    lead,
    blocks: [{ type: "diagnostics", items }],
    followUps: dedupeSuggestions([
      sug("agency.review_first", "¿Por cuál propiedad empiezo?"),
      sug("agency.opportunities", "¿Qué otras oportunidades hay?"),
      sug("agency.promote", "¿Cuáles conviene promocionar?"),
    ]),
    resultIds: items.map((d) => d.propertyId).filter((id): id is string => !!id),
  };
};

// ─── Fotos ───────────────────────────────────────────────────────────────────

export const photos: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const pool = filterRows(p.rows, env.slots);

  const few = pool.filter((r) => r.images < THRESHOLDS.minImages).sort((a, b) => b.d30.views - a.d30.views || a.images - b.images);

  // Mucho tráfico y poco guardado: la gente mira pero no se engancha (puede ser la presentación).
  const weakSaves = pool
    .filter((r) => {
      if (r.d30.views < MIN_VIEWS || few.includes(r)) return false;
      const b = benchFor(p.bench, r.type, r.operation);
      const rate = ratio(r.d30.saves, r.d30.views);
      return rate != null && b.saveRate != null && rate < b.saveRate * 0.5;
    })
    .sort((a, b) => b.d30.views - a.d30.views);

  if (few.length === 0 && weakSaves.length === 0) {
    return {
      lead: phrase(
        "agency.photos.ok",
        [
          `Todas tus propiedades tienen al menos ${THRESHOLDS.minImages} fotos y no veo ninguna donde la gente mire mucho y guarde poco. No puedo juzgar la calidad de una foto, pero por cantidad y comportamiento están bien.`,
          `Todas tus propiedades llegan a ${THRESHOLDS.minImages} fotos o más y ninguna junta muchas visitas con pocos guardados. La calidad de cada foto no la puedo evaluar, pero por cantidad y comportamiento no hay alarmas.`,
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.opportunities", "¿Qué otras oportunidades hay?"), sug("agency.incomplete", "¿Hay publicaciones incompletas?")]),
    };
  }

  const blocks: AdvisorBlock[] = [];
  if (few.length > 0) {
    blocks.push({
      type: "properties",
      title: `Con menos de ${THRESHOLDS.minImages} fotos`,
      items: few.slice(0, limitOf(env.slots.count)).map((r) =>
        propRef(r, env, {
          chips: [`${r.images} ${plural(r.images, "foto", "fotos")}`, `${n0(r.d30.views)} visitas`],
          note: r.d30.views >= MIN_VIEWS ? "Recibe tráfico: mejorar las fotos acá rinde más." : undefined,
          tone: r.images < 3 ? "bad" : "neutral",
          auto: false,
        })
      ),
    });
  }
  if (weakSaves.length > 0) {
    blocks.push({
      type: "properties",
      title: "Mucha gente las mira pero casi nadie las guarda",
      items: weakSaves.slice(0, 3).map((r) =>
        propRef(r, env, {
          chips: [`${n0(r.d30.views)} visitas`, `${n0(r.d30.saves)} favoritos`, `${r.images} fotos`],
          note: "La portada y las primeras fotos podrían no convencer.",
          auto: false,
        })
      ),
    });
  }
  blocks.push({
    type: "caveat",
    text: "No puedo evaluar la calidad visual de una foto: me guío por cuántas hay y por si la gente guarda poco una propiedad que mira mucho.",
  });

  const first = (few[0] ?? weakSaves[0])!;
  const lead =
    few.length > 0
      ? `${count(few.length, "propiedad tiene", "propiedades tienen")} menos de ${THRESHOLDS.minImages} fotos${few[0]!.d30.views >= MIN_VIEWS ? `, y ${quote(few[0]!.title)} recibe bastante tráfico: ahí van a rendir más unas fotos nuevas` : ""}.${weakSaves.length > 0 ? ` Además ${count(weakSaves.length, "propiedad se mira mucho", "propiedades se miran mucho")} y casi no se guarda.` : ""}`
      : `${count(weakSaves.length, "propiedad se mira mucho", "propiedades se miran mucho")} pero casi no se guarda: puede ser que la presentación no convenza.`;

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar la primera", { slots: { propertyIds: [first.id] } }),
      sug("agency.incomplete", "¿Hay publicaciones incompletas?"),
    ]),
    actions: [{ label: "Subir fotos a la primera", href: editHref(first), kind: "primary" }],
    resultIds: [...few, ...weakSaves].slice(0, 6).map((r) => r.id),
    focusPropertyId: first.id,
  };
};

// ─── Publicaciones incompletas ───────────────────────────────────────────────

const HABITABLE = new Set(["casa", "departamento", "duplex", "ph", "quinta"]);

function missing(r: PropertyRow): string[] {
  const out: string[] = [];
  if (r.images < THRESHOLDS.minImages) out.push(r.images === 0 ? "sin fotos" : `solo ${r.images} ${plural(r.images, "foto", "fotos")}`);
  if (r.descriptionLength < THRESHOLDS.minDescription) out.push(r.descriptionLength === 0 ? "sin descripción" : "descripción corta");
  if (!r.area) out.push("sin superficie");
  if (HABITABLE.has(r.type) && r.bedrooms == null) out.push("sin dormitorios");
  if (!r.neighborhood) out.push("sin barrio");
  return out;
}

export const incomplete: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const rank = (a: { r: PropertyRow; m: string[] }, b: { r: PropertyRow; m: string[] }) =>
    b.r.d30.views - a.r.d30.views || b.m.length - a.m.length;
  const live = filterRows(p.rows, env.slots)
    .map((r) => ({ r, m: missing(r) }))
    .filter((x) => x.m.length > 0)
    .sort(rank);
  const drafts = p.drafts.map((r) => ({ r, m: missing(r) })).filter((x) => x.m.length > 0);

  if (live.length === 0 && drafts.length === 0) {
    return {
      lead: phrase(
        "agency.incomplete.ok",
        [
          "Todas tus publicaciones tienen lo básico completo: fotos, descripción, superficie y datos de ubicación. No veo nada que las esté perjudicando por faltante.",
          "Tus publicaciones están completas en lo básico: fotos, descripción, superficie y ubicación. Nada las perjudica por falta de datos.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.opportunities", "¿Qué oportunidades hay?"), sug("agency.photos", "¿Cuáles necesitan mejores fotos?")]),
    };
  }

  const blocks: AdvisorBlock[] = [];
  if (live.length > 0) {
    blocks.push({
      type: "properties",
      title: "Publicadas con datos faltantes",
      items: live.slice(0, limitOf(env.slots.count, 6)).map(({ r, m }) =>
        propRef(r, env, {
          chips: m,
          note: r.d30.views >= MIN_VIEWS ? `Recibe ${n0(r.d30.views)} visitas: completarla rinde más.` : undefined,
          tone: m.length >= 3 ? "bad" : "neutral",
          auto: false,
        })
      ),
    });
  }
  if (drafts.length > 0) {
    blocks.push({
      type: "properties",
      title: "Borradores sin publicar",
      items: drafts.slice(0, 3).map(({ r, m }) => propRef(r, env, { chips: m, note: "Sigue como borrador: nadie la ve todavía.", auto: false })),
    });
  }

  const worst = live[0];
  const lead = `${live.length > 0 ? `${count(live.length, "publicación tiene", "publicaciones tienen")} datos faltantes que pueden restarle confianza` : "No hay publicadas con faltantes"}${
    worst ? `; la más expuesta es ${quote(worst.r.title)} (${list(worst.m.slice(0, 3))})` : ""
  }.${drafts.length > 0 ? ` Y tenés ${count(drafts.length, "borrador", "borradores")} sin terminar.` : ""}`;

  const first = (worst ?? drafts[0])!;
  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.photos", "¿Cuáles necesitan mejores fotos?"),
      sug("agency.actions", "¿Qué me recomendás hacer?"),
    ]),
    actions: [{ label: "Completar la primera", href: editHref(first.r), kind: "primary" }],
    resultIds: [...live, ...drafts].slice(0, 6).map((x) => x.r.id),
    focusPropertyId: first.r.id,
  };
};

// ─── Sin consultas ───────────────────────────────────────────────────────────

export const staleInquiries: AgencyHandler = (env) => {
  const { portfolio: p, now } = env;
  const grace = THRESHOLDS.newListingGraceDays * DAY_MS;
  const pool = filterRows(p.rows, env.slots).filter((r) => !r.publishedAt || now.getTime() - r.publishedAt.getTime() >= grace);
  const silent = pool
    .filter((r) => consultas(r.d30) === 0)
    .sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));

  if (silent.length === 0) {
    return {
      lead: phrase(
        "agency.stale.ok",
        [
          "Todas tus propiedades con más de una semana publicadas recibieron al menos una consulta en los últimos 30 días.",
          "Ninguna propiedad con más de una semana publicada se quedó sin consultas en los últimos 30 días.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.views_no_inquiries", "¿Cuáles tienen visitas pero pocas consultas?"), sug("agency.best", "¿Cuáles funcionan mejor?")]),
    };
  }

  const shown = silent.slice(0, limitOf(env.slots.count, 6));
  const refs = shown.map((r) =>
    propRef(r, env, {
      chips: [r.publishedAt ? `${Math.floor((now.getTime() - r.publishedAt.getTime()) / DAY_MS)} días publicada` : "publicada", `${n0(r.d30.views)} visitas`, "0 consultas"],
      note: r.d30.views >= MIN_VIEWS ? "La ven pero nadie consulta." : r.d30.views < 5 ? "Casi no la ve nadie." : undefined,
      tone: "bad",
    })
  );
  const blocks: AdvisorBlock[] = [{ type: "properties", items: refs }];
  if (hasThinData(env)) blocks.push({ type: "caveat", text: THIN_DATA_TEXT });

  const oldest = shown[0]!;
  const lead = `${count(silent.length, "propiedad lleva", "propiedades llevan")} 30 días sin recibir ninguna consulta${
    oldest.publishedAt ? `; la que más tiempo lleva es ${quote(oldest.title)}, publicada ${daysAgo(oldest.publishedAt, now)}` : ""
  }.`;

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar por qué", { slots: { propertyIds: shown.map((r) => r.id) }, tone: "warn" }),
      sug("agency.simulate_price", "¿Qué pasaría si bajo el precio?", { slots: { propertyIds: shown.map((r) => r.id), percent: -5 } }),
      sug("agency.photos", "¿Necesitan mejores fotos?"),
    ]),
    resultIds: shown.map((r) => r.id),
    focusPropertyId: shown[0]?.id,
    mood: silent.length >= 3 ? "surprised" : "neutral",
  };
};

// ─── Oportunidades ───────────────────────────────────────────────────────────

export const opportunities: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const scoped = env.slots.zones?.length || env.slots.types?.length;
  const pool = new Set(filterRows(p.rows, env.slots).map((r) => r.id));
  const items = groupDiagnostics(
    p.intel.opportunities.filter((d) => d.kind === "opportunity" && (!scoped || !d.propertyId || pool.has(d.propertyId))),
    limitOf(env.slots.count, 6)
  );

  if (items.length === 0) {
    return {
      lead: phrase(
        "agency.opps.none",
        [
          "Hoy no detecto oportunidades pendientes: lo que podías sumar (recorrido 360°, videos, fotos, más propiedades) ya lo tenés cubierto o no hay datos para sugerirlo.",
          "No veo oportunidades pendientes por ahora: lo que se podía sumar (recorrido 360°, videos, fotos, más propiedades) ya está o todavía no hay datos para recomendarlo.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.review_first", "¿Qué debería revisar primero?"), sug("agency.best", "¿Cuáles funcionan mejor?")]),
    };
  }

  const kinds = new Set(items.map((d) => ruleOf(d)));
  return {
    lead: phrase(
      "agency.opps.found",
      [
        `Encontré ${count(items.length, "oportunidad", "oportunidades")} que todavía no estás aprovechando${kinds.has("no-tour") ? ", empezando por el recorrido 360°" : ""}. Cada una viene con la acción concreta y el acceso directo.`,
        `Hay ${count(items.length, "oportunidad", "oportunidades")} para mejorar${kinds.has("no-tour") ? ", y la primera es el recorrido 360°" : ""}. Cada una trae qué hacer y un acceso directo.`,
        `Te quedan ${count(items.length, "oportunidad", "oportunidades")} sin aprovechar${kinds.has("no-tour") ? " (arrancaría por el recorrido 360°)" : ""}. Abajo tenés la acción concreta de cada una.`,
      ],
      env.context.turn
    ),
    blocks: [{ type: "diagnostics", items }],
    followUps: dedupeSuggestions([sug("agency.actions", "¿Cuál tiene más impacto?"), sug("agency.promote", "¿Qué promociono?")]),
    resultIds: items.map((d) => d.propertyId).filter((id): id is string => !!id),
  };
};

// ─── Qué promocionar ─────────────────────────────────────────────────────────

export const promote: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const n = limitOf(env.slots.count, 3);
  const pool = filterRows(p.rows, env.slots);

  // Igual que el agente de marketing: lo que se promocionó hace poco baja puntos, así los dos recomiendan lo mismo.
  const scored = rankForPromotion(pool, p.bench, now, { promotedDaysAgo: await loadPromotedDaysAgo(env.scope.agencyId) });

  const eligible = scored.filter((s) => !s.blocked);
  const shown = eligible.slice(0, n);
  if (shown.length === 0) {
    return {
      lead: phrase(
        "agency.promote.none",
        [
          "Hoy no promocionaría ninguna: las propiedades que tenés todavía necesitan fotos o resolver algún problema antes de empujarlas.",
          "Por ahora no empujaría ninguna: primero conviene sumar fotos o resolver algún problema en las que tenés.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.photos", "¿Cuáles necesitan mejores fotos?"), sug("agency.review_first", "¿Qué reviso primero?")]),
    };
  }

  const lead = `${phrase("agency.promote.pick", ["Yo promocionaría", "Mi elección para promocionar sería", "Para promocionar, elegiría"], env.context.turn)} ${list(shown.map((s) => quote(s.r.title, 40)))}${
    shown.length < n ? ` (sólo ${shown.length} ${plural(shown.length, "cumple", "cumplen")} las condiciones para empujarla bien)` : ""
  }. Elegí propiedades bien presentadas y con señales de interés, para que la visibilidad extra no se pierda.`;

  const refs = shown.map((s) =>
    propRef(s.r, env, {
      chips: [`${n0(s.r.d30.views)} visitas`, `${n0(consultas(s.r.d30))} consultas`],
      note: promotionNote(s.reasons),
      tone: "good",
      auto: false,
    })
  );
  const skipped = scored.filter((s) => s.blocked).length;
  const blocks: AdvisorBlock[] = [{ type: "properties", items: refs }];
  if (skipped > 0) blocks.push({ type: "caveat", text: `Dejé afuera ${count(skipped, "propiedad", "propiedades")} por tener muy pocas fotos o un problema pendiente.` });
  if (hasThinData(env)) blocks.push({ type: "caveat", text: THIN_DATA_TEXT });

  const followUps: SuggestionQuery[] = [
    sug("agency.traits", "¿Qué tienen en común las que mejor funcionan?"),
    sug("agency.actions", "¿Qué más me recomendás?"),
  ];
  return {
    lead,
    blocks,
    followUps,
    actions: [{ label: "Preparar publicación para redes", href: "/dashboard/contenido", kind: "primary" }],
    resultIds: shown.map((s) => s.r.id),
    focusPropertyId: shown[0]!.r.id,
  };
};

