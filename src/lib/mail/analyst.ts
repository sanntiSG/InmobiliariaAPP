/**
 * El analista del correo: resúmenes y recomendaciones sobre los mails de una inmobiliaria, con OPCIONES FIJAS (no es un chat). Hace
 * lo mismo que el asesor principal pero para la bandeja: no entiende frases, responde a la opción que se toca. Todo sale de datos
 * (conteos, comparaciones con el período anterior, qué preguntan seguido y qué datos faltan en las publicaciones), sin IA.
 *
 * Dos capas: `loadAnalystData` junta los números (con agregados de la base, acotados a una ventana de días) y `answerAnalyst` /
 * `briefing` los convierten en texto y bloques (funciones puras: se prueban con datos inventados).
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { Property } from "@/lib/db/models/Property";
import { MAIL_CATEGORY_LABELS, INQUIRY_CATEGORIES, HOLD_LABELS, type HoldCode, type MailCategory } from "./constants";
import { askLabel } from "@/lib/agents/knowledge/asks";
import type { AdvisorBlock } from "@/lib/advisor/types";

export const ANALYST_OPTIONS = ["summary_received", "summary_sent", "frequent_questions", "needs_human", "recent", "recommendations"] as const;
export type AnalystOption = (typeof ANALYST_OPTIONS)[number];

export const ANALYST_LABELS: Record<AnalystOption, string> = {
  summary_received: "Resumen de lo recibido",
  summary_sent: "Resumen de lo enviado",
  frequent_questions: "Lo que más preguntan",
  needs_human: "Lo que necesita a una persona",
  recent: "Actividad reciente",
  recommendations: "Qué podés mejorar",
};

export type AnalystTone = "good" | "warn" | "neutral";

export type AnalystData = {
  days: number;
  mode: "confirm" | "auto";
  /** Mails que llegaron en la ventana, por categoría. */
  received: { total: number; byCategory: Record<string, number>; previousInquiries: number };
  sent: { total: number; auto: number; byPerson: number; failed: number; followUps: number; unedited: number; confirmedByPerson: number };
  /** Lo que espera a alguien AHORA (sin importar la ventana). */
  pending: { confirm: number; doubts: number; unsure: number; errors: number; oldestConfirmHours: number | null; oldestDoubtHours: number | null };
  topics: { topic: string; count: number }[];
  humanTopics: { topic: string; count: number }[];
  /** Preguntas puntuales más frecuentes (sin las que el agente no reconoce). */
  questions: { key: string; label: string; count: number }[];
  /** Datos que la publicación no tiene y alguien preguntó: por propiedad y pregunta. */
  missing: { propertyId: string; propertyTitle: string; key: string; label: string; count: number }[];
  holdReasons: { code: string; count: number }[];
  recent: { at: string; title: string; detail?: string; tone?: AnalystTone; href?: string }[];
};

export type AnalystRecommendation = { tone: AnalystTone; title: string; detail: string; action?: { label: string; href: string } };

export type AnalystAnswer = {
  option: AnalystOption;
  lead: string;
  blocks: AdvisorBlock[];
  recommendations: AnalystRecommendation[];
  followUps: AnalystOption[];
};

export type AnalystBriefing = {
  headlines: { text: string; tone: AnalystTone }[];
  options: { option: AnalystOption; label: string; hint?: string; tone?: AnalystTone }[];
};

// ─── Utilidades ──────────────────────────────────────────────────────────────

const INBOX = "/dashboard/agentes/correo";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hoursText = (h: number): string => (h < 1 ? "hace menos de una hora" : h < 48 ? `hace ${Math.round(h)} ${Math.round(h) === 1 ? "hora" : "horas"}` : `hace ${Math.round(h / 24)} días`);
const sum = (o: Record<string, number>, keys: readonly string[]): number => keys.reduce((n, k) => n + (o[k] ?? 0), 0);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Mails que son consultas en una ventana. */
export const inquiriesOf = (d: AnalystData): number => sum(d.received.byCategory, INQUIRY_CATEGORIES);

/** "+25 %" / "−10 %" respecto del período anterior; `null` si no hay con qué comparar. */
export function trendOf(now: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((now - previous) / previous) * 100);
}

const topicLabel = (t: string): string => MAIL_CATEGORY_LABELS[t as MailCategory] ?? t;

// ─── Recomendaciones (reglas simples sobre los datos) ────────────────────────

export function recommendationsFor(d: AnalystData): AnalystRecommendation[] {
  const out: AnalystRecommendation[] = [];
  const inquiries = inquiriesOf(d);

  // 1. Datos que faltan publicar: lo que varias personas preguntaron y la ficha no tiene.
  const topMissing = [...d.missing].filter((m) => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);
  for (const m of topMissing) {
    out.push({
      tone: "warn",
      title: `${plural(m.count, "persona preguntó", "personas preguntaron")} por ${m.label} de «${m.propertyTitle}» y no figura`,
      detail: "Cargarlo en la publicación evita que cada consulta quede esperando a una persona.",
      action: { label: "Completar la publicación", href: `/dashboard/propiedades/${m.propertyId}/editar` },
    });
  }

  // 2. Lo que está esperando.
  if (d.pending.doubts > 0 && (d.pending.oldestDoubtHours ?? 0) >= 24) {
    out.push({ tone: "warn", title: `${plural(d.pending.doubts, "duda sin responder", "dudas sin responder")}, la más vieja ${hoursText(d.pending.oldestDoubtHours!)}`, detail: "Quien preguntó sigue esperando lo que el agente no pudo contestar.", action: { label: "Ver las dudas", href: INBOX } });
  }
  if (d.pending.confirm >= 3) {
    out.push({ tone: "warn", title: `${plural(d.pending.confirm, "respuesta espera", "respuestas esperan")} tu confirmación`, detail: d.pending.oldestConfirmHours != null ? `La más vieja llegó ${hoursText(d.pending.oldestConfirmHours)}. Responder rápido mejora las chances de concretar la visita.` : "Responder rápido mejora las chances de concretar la visita.", action: { label: "Revisar y enviar", href: INBOX } });
  }

  // 3. Pasar a automático: casi todo lo que se confirmó se envió sin cambios.
  if (d.mode === "confirm" && d.sent.confirmedByPerson >= 10 && d.sent.unedited / d.sent.confirmedByPerson >= 0.8) {
    out.push({ tone: "good", title: "Casi todo lo que confirmaste lo enviaste sin cambios", detail: `Enviaste sin tocar ${d.sent.unedited} de ${d.sent.confirmedByPerson} respuestas. Podés dejar que las consultas claras salgan solas y revisar sólo lo dudoso.`, action: { label: "Revisar la configuración", href: INBOX } });
  }

  // 4. Temas que preguntan seguido y requieren a una persona.
  const frequentHuman = d.humanTopics.find((t) => t.count >= 3);
  if (frequentHuman) {
    out.push({ tone: "neutral", title: `Preguntan seguido por ${frequentHuman.topic} (${frequentHuman.count} veces)`, detail: "Si lo sumás al texto de las publicaciones (o a tu firma), muchas consultas se resuelven sin intervención.", action: { label: "Ver las consultas", href: INBOX } });
  }

  // 5. El agente dudó seguido.
  if (d.pending.unsure >= 3) {
    out.push({ tone: "neutral", title: `El agente no estuvo seguro ${d.pending.unsure} veces`, detail: "Si en esas consultas usás «Cambiar tema», aprende a reconocer las parecidas.", action: { label: "Ver las dudosas", href: INBOX } });
  }

  // 6. Sin consultas.
  if (inquiries === 0 && d.received.total === 0) {
    out.push({ tone: "neutral", title: "No llegaron mails en este período", detail: "Revisá que la casilla esté conectada y que tus avisos y portales usen ese correo como contacto.", action: { label: "Ver la conexión", href: INBOX } });
  }

  if (out.length === 0) out.push({ tone: "good", title: "Todo en orden", detail: "No hay nada para mejorar ahora: las consultas se están atendiendo y las publicaciones responden lo que preguntan." });
  return out;
}

// ─── Respuestas por opción ───────────────────────────────────────────────────

export function answerAnalyst(option: AnalystOption, d: AnalystData): AnalystAnswer {
  const inquiries = inquiriesOf(d);
  const window = `los últimos ${d.days} días`;
  const base = { option, recommendations: [] as AnalystRecommendation[] };

  switch (option) {
    case "summary_received": {
      const ignored = d.received.total - inquiries;
      const trend = trendOf(inquiries, d.received.previousInquiries);
      const trendText = trend == null ? "" : trend === 0 ? " Es lo mismo que en el período anterior." : ` Es ${Math.abs(trend)} % ${trend > 0 ? "más" : "menos"} que en los ${d.days} días anteriores.`;
      const topics = INQUIRY_CATEGORIES.map((c) => ({ label: MAIL_CATEGORY_LABELS[c], value: d.received.byCategory[c] ?? 0 })).filter((t) => t.value > 0).sort((a, b) => b.value - a.value);
      return {
        ...base,
        lead: d.received.total === 0 ? `En ${window} no llegó ningún mail.` : `En ${window} llegaron ${plural(d.received.total, "mail", "mails")}: ${plural(inquiries, "consulta", "consultas")} y ${plural(ignored, "mail que no era una consulta", "mails que no eran consultas")}.${trendText}`,
        blocks: [
          { type: "metrics", items: [{ label: "Recibidos", value: String(d.received.total) }, { label: "Consultas", value: String(inquiries), delta: trend, tone: trend == null || trend === 0 ? "neutral" : trend > 0 ? "good" : "bad" }, { label: "Otros mails", value: String(ignored) }] },
          ...(topics.length > 0 ? [{ type: "bars", items: topics } as AdvisorBlock] : []),
        ],
        followUps: ["frequent_questions", "summary_sent", "recommendations"],
      };
    }
    case "summary_sent": {
      const auto = d.sent.auto;
      return {
        ...base,
        lead: d.sent.total === 0 ? `En ${window} todavía no se envió ninguna respuesta.` : `En ${window} se respondieron ${plural(d.sent.total, "consulta", "consultas")}: ${auto} ${auto === 1 ? "salió sola" : "salieron solas"} y ${d.sent.byPerson} ${d.sent.byPerson === 1 ? "la envió" : "las enviaron"} una persona.${d.sent.failed > 0 ? ` ${plural(d.sent.failed, "no se pudo enviar", "no se pudieron enviar")}.` : ""}`,
        blocks: [{ type: "metrics", items: [{ label: "Enviadas", value: String(d.sent.total) }, { label: "Solas", value: String(auto) }, { label: "Por una persona", value: String(d.sent.byPerson) }, { label: "Seguimientos", value: String(d.sent.followUps) }, ...(d.sent.failed > 0 ? [{ label: "Con error", value: String(d.sent.failed), tone: "bad" as const }] : [])] }],
        recommendations: [],
        followUps: ["summary_received", "needs_human", "recommendations"],
      };
    }
    case "frequent_questions": {
      if (d.questions.length === 0 && d.topics.length === 0) {
        return { ...base, lead: "Todavía no hay suficientes consultas para ver qué se repite.", blocks: [{ type: "caveat", text: `Se cuentan las preguntas puntuales de los mails que el agente fue leyendo en ${window}.` }], followUps: ["summary_received", "recommendations"] };
      }
      const top = d.questions.slice(0, 8);
      return {
        ...base,
        lead: top.length > 0 ? `Lo que más preguntan en ${window}: ${top.slice(0, 3).map((q) => `${q.label} (${q.count})`).join(", ")}.` : `Los temas que más aparecen en ${window}.`,
        blocks: [
          ...(top.length > 0 ? [{ type: "bars", items: top.map((q) => ({ label: cap(q.label), value: q.count })) } as AdvisorBlock] : []),
          ...(d.topics.length > 0 ? [{ type: "bars", items: d.topics.slice(0, 6).map((t) => ({ label: topicLabel(t.topic), value: t.count, sublabel: "tema del mail" })) } as AdvisorBlock] : []),
        ],
        followUps: ["recommendations", "needs_human", "summary_received"],
      };
    }
    case "needs_human": {
      const p = d.pending;
      const total = p.confirm + p.doubts + p.unsure + p.errors;
      if (total === 0) return { ...base, lead: "No tenés nada pendiente: todo lo que llegó está atendido.", blocks: [], followUps: ["summary_sent", "recommendations"] };
      const oldest = Math.max(p.oldestConfirmHours ?? 0, p.oldestDoubtHours ?? 0);
      return {
        ...base,
        lead: `Hay ${plural(total, "cosa", "cosas")} para que mires${oldest >= 1 ? `; lo más viejo llegó ${hoursText(oldest)}` : ""}.`,
        blocks: [
          { type: "metrics", items: [{ label: "Para confirmar", value: String(p.confirm), tone: p.confirm > 0 ? "bad" : "neutral" }, { label: "Dudas sin responder", value: String(p.doubts), tone: p.doubts > 0 ? "bad" : "neutral" }, { label: "No entendidos", value: String(p.unsure) }, { label: "Con error", value: String(p.errors), tone: p.errors > 0 ? "bad" : "neutral" }] },
          ...(d.humanTopics.length > 0 ? [{ type: "bars", items: d.humanTopics.slice(0, 6).map((t) => ({ label: cap(t.topic), value: t.count, sublabel: "tema para una persona" })) } as AdvisorBlock] : []),
          ...(d.holdReasons.length > 0 ? [{ type: "bars", items: d.holdReasons.slice(0, 5).map((r) => ({ label: HOLD_LABELS[r.code as HoldCode] ?? r.code, value: r.count, sublabel: "por qué no salió sola" })) } as AdvisorBlock] : []),
        ],
        followUps: ["recommendations", "recent", "summary_received"],
      };
    }
    case "recent":
      return {
        ...base,
        lead: d.recent.length === 0 ? "Todavía no hay movimiento para mostrar." : "Esto fue lo último que pasó en tu bandeja.",
        blocks: d.recent.length > 0 ? [{ type: "timeline", items: d.recent.map((r) => ({ at: r.at, title: r.title, detail: r.detail, tone: r.tone === "warn" ? "bad" : r.tone === "good" ? "good" : "neutral", href: r.href })) }] : [],
        followUps: ["needs_human", "summary_received"],
      };
    case "recommendations": {
      const recs = recommendationsFor(d);
      return { ...base, lead: recs.length === 1 && recs[0]!.tone === "good" ? recs[0]!.title + "." : `Encontré ${plural(recs.length, "cosa que puede mejorar", "cosas que pueden mejorar")}.`, blocks: [], recommendations: recs, followUps: ["frequent_questions", "needs_human", "summary_sent"] };
    }
  }
}

/** Lo primero que se ve: 1 o 2 titulares y las opciones con un adelanto de cada una. */
export function briefing(d: AnalystData): AnalystBriefing {
  const p = d.pending;
  const todo = p.confirm + p.doubts + p.unsure + p.errors;
  const inquiries = inquiriesOf(d);
  const trend = trendOf(inquiries, d.received.previousInquiries);
  const headlines: AnalystBriefing["headlines"] = [];
  headlines.push(todo > 0 ? { text: `Tenés ${plural(todo, "cosa", "cosas")} para atender${p.doubts > 0 ? `, ${plural(p.doubts, "duda", "dudas")} sin responder` : ""}.`, tone: "warn" } : { text: "Todo al día: no hay nada pendiente.", tone: "good" });
  if (trend != null && Math.abs(trend) >= 10 && inquiries >= 3) headlines.push({ text: `Las consultas ${trend > 0 ? "subieron" : "bajaron"} ${Math.abs(trend)} % frente al período anterior.`, tone: trend > 0 ? "good" : "warn" });
  const recs = recommendationsFor(d).filter((r) => r.tone !== "good");
  return {
    headlines,
    options: [
      { option: "needs_human", label: ANALYST_LABELS.needs_human, hint: todo > 0 ? String(todo) : undefined, tone: todo > 0 ? "warn" : "neutral" },
      { option: "summary_received", label: ANALYST_LABELS.summary_received, hint: `${d.received.total}` },
      { option: "summary_sent", label: ANALYST_LABELS.summary_sent, hint: `${d.sent.total}` },
      { option: "frequent_questions", label: ANALYST_LABELS.frequent_questions },
      { option: "recommendations", label: ANALYST_LABELS.recommendations, hint: recs.length > 0 ? String(recs.length) : undefined, tone: recs.length > 0 ? "warn" : "neutral" },
      { option: "recent", label: ANALYST_LABELS.recent },
    ],
  };
}

// ─── Carga de los números (agregados de la base, sólo de ESA inmobiliaria) ──

const DAY_MS = 86_400_000;

type CountRow = { _id: string | null; n: number };
const toMap = (rows: CountRow[]): Record<string, number> => Object.fromEntries(rows.filter((r) => r._id).map((r) => [r._id as string, r.n]));

export async function loadAnalystData(agencyId: string, mode: "confirm" | "auto", days = 30, now: Date = new Date()): Promise<AnalystData> {
  await connectDB();
  const agency = new Types.ObjectId(agencyId);
  const since = new Date(now.getTime() - days * DAY_MS);
  const before = new Date(since.getTime() - days * DAY_MS);
  const inWindow = { agencyId: agency, receivedAt: { $gte: since } };
  const hoursSince = (d: Date | null | undefined): number | null => (d ? Math.max(0, (now.getTime() - new Date(d).getTime()) / 3_600_000) : null);

  const [byCategory, previousInquiries, sentAgg, topics, humanTopics, askAgg, holdAgg, awaiting, doubts, unsure, failed, oldestConfirm, oldestDoubt, recentDocs] = await Promise.all([
    MailMessage.aggregate<CountRow>([{ $match: inWindow }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
    MailMessage.countDocuments({ agencyId: agency, receivedAt: { $gte: before, $lt: since }, category: { $in: INQUIRY_CATEGORIES } }),
    MailMessage.aggregate<{ _id: { auto: boolean; edited: boolean } | null; n: number; followUps: number }>([
      { $match: { ...inWindow, status: "sent" } },
      { $group: { _id: { auto: "$auto", edited: "$edited" }, n: { $sum: 1 }, followUps: { $sum: { $size: { $ifNull: ["$followUps", []] } } } } },
    ]),
    MailMessage.aggregate<CountRow>([{ $match: { ...inWindow, category: { $in: INQUIRY_CATEGORIES } } }, { $unwind: "$topics" }, { $group: { _id: "$topics", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    MailMessage.aggregate<CountRow>([{ $match: inWindow }, { $unwind: "$humanTopics" }, { $group: { _id: "$humanTopics", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    MailMessage.aggregate<{ _id: { key: string; state: string; propertyId: Types.ObjectId | null }; n: number }>([
      { $match: { ...inWindow, "asks.0": { $exists: true } } },
      { $unwind: "$asks" },
      { $group: { _id: { key: "$asks.key", state: "$asks.state", propertyId: "$asks.propertyId" }, n: { $sum: 1 } } },
    ]),
    MailMessage.aggregate<CountRow>([{ $match: { ...inWindow, holdCode: { $exists: true, $ne: null } } }, { $group: { _id: "$holdCode", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    MailMessage.countDocuments({ agencyId: agency, status: "awaiting_confirmation" }),
    MailMessage.countDocuments({ agencyId: agency, humanState: "pending" }),
    MailMessage.countDocuments({ agencyId: agency, status: "awaiting_confirmation", uncertain: true }),
    MailMessage.countDocuments({ agencyId: agency, status: "failed" }),
    MailMessage.findOne({ agencyId: agency, status: "awaiting_confirmation" }).sort({ receivedAt: 1 }).select("receivedAt").lean(),
    MailMessage.findOne({ agencyId: agency, humanState: "pending" }).sort({ receivedAt: 1 }).select("receivedAt").lean(),
    MailMessage.find({ agencyId: agency }).sort({ receivedAt: -1 }).limit(8).select("from subject status auto humanState receivedAt category").lean(),
  ]);

  // Enviados: solos / por una persona / sin cambios (de lo que confirmó una persona).
  let total = 0, auto = 0, followUps = 0, unedited = 0, confirmedByPerson = 0;
  for (const r of sentAgg) {
    total += r.n;
    followUps += r.followUps;
    if (r._id?.auto) auto += r.n;
    else {
      confirmedByPerson += r.n;
      if (!r._id?.edited) unedited += r.n;
    }
  }

  // Preguntas: las más frecuentes (sin las que el agente no reconoce) y los datos que faltan por propiedad.
  const byKey = new Map<string, number>();
  const missing = new Map<string, { propertyId: string; key: string; count: number }>();
  for (const r of askAgg) {
    if (r._id.key !== "other") byKey.set(r._id.key, (byKey.get(r._id.key) ?? 0) + r.n);
    if (r._id.key !== "other" && r._id.propertyId && (r._id.state === "missing" || r._id.state === "human")) {
      const k = `${r._id.propertyId}:${r._id.key}`;
      const e = missing.get(k) ?? { propertyId: String(r._id.propertyId), key: r._id.key, count: 0 };
      e.count += r.n;
      missing.set(k, e);
    }
  }
  const topMissing = [...missing.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const props = topMissing.length > 0 ? await Property.find({ _id: { $in: topMissing.map((m) => new Types.ObjectId(m.propertyId)) }, agencyId: agency }).select("title").lean() : [];
  const titleOf = new Map(props.map((p) => [String(p._id), p.title]));

  return {
    days,
    mode,
    received: { total: Object.values(toMap(byCategory)).reduce((a, b) => a + b, 0), byCategory: toMap(byCategory), previousInquiries },
    sent: { total, auto, byPerson: total - auto, failed, followUps, unedited, confirmedByPerson },
    pending: { confirm: awaiting, doubts, unsure, errors: failed, oldestConfirmHours: hoursSince(oldestConfirm?.receivedAt), oldestDoubtHours: hoursSince(oldestDoubt?.receivedAt) },
    topics: topics.filter((t) => t._id).map((t) => ({ topic: t._id as string, count: t.n })),
    humanTopics: humanTopics.filter((t) => t._id).map((t) => ({ topic: t._id as string, count: t.n })),
    questions: [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, count]) => ({ key, label: askLabel(key), count })),
    missing: topMissing.filter((m) => titleOf.has(m.propertyId)).map((m) => ({ propertyId: m.propertyId, propertyTitle: titleOf.get(m.propertyId)!, key: m.key, label: askLabel(m.key), count: m.count })),
    holdReasons: holdAgg.filter((h) => h._id).map((h) => ({ code: h._id as string, count: h.n })),
    recent: recentDocs.map((m) => {
      const who = m.from?.name || m.from?.email || "Alguien";
      const waiting = m.humanState === "pending" || m.status === "awaiting_confirmation" || m.status === "failed";
      const what = m.status === "sent" ? (m.auto ? "Se le respondió sola" : "Se le respondió") : m.status === "awaiting_confirmation" ? "Espera tu confirmación" : m.status === "failed" ? "No se pudo enviar" : m.status === "discarded" ? "Descartado" : "Ignorado";
      return { at: new Date(m.receivedAt ?? now).toISOString(), title: `${who}: ${m.subject || "sin asunto"}`.slice(0, 120), detail: what, tone: (waiting ? "warn" : m.status === "sent" ? "good" : "neutral") as AnalystTone, href: `${INBOX}?m=${m._id}` };
    }),
  };
}
