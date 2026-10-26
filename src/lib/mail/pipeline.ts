/**
 * La revisión de un buzón, de punta a punta: entra a la bandeja (sólo lectura), toma los mails que llegaron DESPUÉS de lo
 * ya visto, descarta lo que no es una consulta, entiende las que sí, prepara la respuesta con el catálogo REAL de la
 * inmobiliaria, decide si puede salir sola o necesita confirmación, anota el cliente y avisa al equipo. Cada paso es
 * idempotente (el índice único de `MailMessage` evita procesar un mail dos veces) y el cursor sólo avanza hasta donde se
 * terminó bien: si algo falla a mitad de camino, la próxima revisión sigue desde ahí. Presupuesto de tiempo acotado (las
 * funciones de Netlify duran ~10 s): `deadline` corta la lectura y lo que falte queda para la siguiente.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Lead } from "@/lib/db/models/Lead";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create";
import { agencyMemberIds } from "@/lib/notifications/agency-members";
import { dayStart } from "@/lib/tracking/record";
import { analyzeMail } from "./analyze";
import { cleanBody } from "./clean";
import { openCreds } from "./creds";
import { MAIL_LIMITS, isInquiry, type MailCategory } from "./constants";
import { decideAuto } from "./decide";
import { prefilter, replyAddress } from "./prefilter";
import { POLL_EVERY_MS } from "./schedule";
import { loadSettings, type MailSettingsView } from "./settings";
import { explain, pollNew, type FetchedMail } from "./transport";

const DAY_MS = 86_400_000;
const LOCK_MS = 90_000;
/** Espera creciente cuando el buzón falla (15, 30 y 60 minutos). */
const BACKOFF_MIN = [15, 30, 60] as const;

export type PollOutcome = {
  mailboxId: string;
  status: "ok" | "busy" | "error";
  /** Mails nuevos que se miraron. */
  seen: number;
  /** Respuestas que quedaron para confirmar. */
  drafts: number;
  /** Respuestas que salen solas (quedan en cola para enviar). */
  queued: number;
  ignored: number;
  /** Quedan mails por revisar (se cortó por tiempo o por cantidad). */
  more: boolean;
  /** Primera conexión: sólo se marcó hasta dónde llega la bandeja hoy. */
  reset?: boolean;
  error?: string;
};

export type PipelineCtx = {
  agencyId: string;
  agencyName: string;
  mailboxId: string;
  ownEmail: string;
  settings: MailSettingsView;
};

const expiresIn = (days: number) => new Date(Date.now() + days * DAY_MS);

/** Anota (o suma a) el cliente que escribió. Una nueva consulta del mismo contacto por la misma propiedad en el día se junta en un solo cliente. */
export async function recordLead(ctx: PipelineCtx, args: { propertyId: string; name: string; email: string; text: string }): Promise<string | null> {
  try {
    const since = new Date(Date.now() - DAY_MS);
    const message = { text: args.text.slice(0, 1000), at: new Date() };
    const existing = await Lead.findOneAndUpdate(
      { agencyId: ctx.agencyId, propertyId: args.propertyId, email: args.email, createdAt: { $gte: since } },
      { $push: { messages: message } },
      { returnDocument: "after" }
    ).select("_id");
    if (existing) return String(existing._id);
    const lead = await Lead.create({
      agencyId: ctx.agencyId,
      propertyId: args.propertyId,
      name: args.name.slice(0, 80) || args.email.split("@")[0]!.slice(0, 80),
      email: args.email.slice(0, 120),
      source: "email",
      messages: [message],
    });
    return String(lead._id);
  } catch (err) {
    console.error("mail recordLead failed:", err);
    return null;
  }
}

export type Counts = { drafts: number; queued: number; ignored: number };

/** Un seguimiento ("¿y tiene cochera?") no nombra la propiedad: sólo se busca en la conversación si el mail es corto. */
const FOLLOW_UP_MAX_CHARS = 600;
const FOLLOW_UP_WINDOW_MS = 48 * 3_600_000;

/**
 * Las propiedades de la conversación anterior con esta persona: primero las del mail al que contesta (`In-Reply-To` y
 * `References`, que incluyen el primer mail aunque lo que contestó fuera nuestra respuesta) y, si no, las de lo último que
 * escribió en las últimas 48 horas. Sólo propiedades de ESTA casilla; la selección las vuelve a validar contra el catálogo.
 */
async function threadProperties(ctx: PipelineCtx, mail: FetchedMail, text: string): Promise<string[]> {
  if (text.length > FOLLOW_UP_MAX_CHARS) return [];
  try {
    const refs = [mail.inReplyTo, ...mail.references].filter((x): x is string => !!x).map((r) => r.slice(0, 400));
    if (refs.length > 0) {
      const inThread = await MailMessage.findOne({ mailboxId: ctx.mailboxId, messageId: { $in: refs }, "propertyIds.0": { $exists: true } })
        .sort({ receivedAt: -1 })
        .select("propertyIds")
        .lean();
      if (inThread?.propertyIds?.length) return inThread.propertyIds.map(String);
    }
    const before = await MailMessage.findOne({
      agencyId: ctx.agencyId,
      "from.email": mail.from.email.toLowerCase(),
      receivedAt: { $gte: new Date(mail.date.getTime() - FOLLOW_UP_WINDOW_MS), $lt: mail.date },
      "propertyIds.0": { $exists: true },
    })
      .sort({ receivedAt: -1 })
      .select("propertyIds")
      .lean();
    return before?.propertyIds?.map(String) ?? [];
  } catch (err) {
    console.error("mail threadProperties failed:", (err as Error)?.message);
    return [];
  }
}

export async function processMail(ctx: PipelineCtx, mail: FetchedMail, counts: Counts): Promise<void> {
  const text = cleanBody(mail.text);
  const base = {
    agencyId: ctx.agencyId,
    mailboxId: ctx.mailboxId,
    messageId: mail.messageId.slice(0, 400),
    uid: mail.uid,
    from: { name: mail.from.name, email: mail.from.email },
    replyTo: replyAddress(mail.headers),
    subject: mail.subject,
    receivedAt: mail.date,
    inReplyTo: mail.inReplyTo ?? undefined,
    references: mail.references.map((r) => r.slice(0, 400)),
    authFailed: mail.auth === "fail",
  };

  const ignore = async (category: MailCategory, reasons: string[], confidence = 0.9, keepText = false) => {
    // De lo automático (listas, rebotes, spam, la propia casilla) no se guarda el texto. De lo que escribió una persona y no se
    // entendió sí, 14 días y acotado: así el equipo lo ve y puede marcarlo "Era una consulta".
    await MailMessage.create({ ...base, category, confidence, reasons, status: "ignored", text: keepText ? text.slice(0, 4000) : "", expiresAt: expiresIn(MAIL_LIMITS.retentionIgnoredDays) });
    counts.ignored++;
  };

  const pre = prefilter(mail.headers, { ownEmail: ctx.ownEmail, blocked: ctx.settings.blockedSenders });
  if (pre.skip) return void (await ignore(pre.category, [pre.reason]));

  const { selection, classification: cls, compose, unanswered } = await analyzeMail(ctx, {
    subject: mail.subject,
    text,
    fromName: mail.from.name || null,
    seed: mail.messageId,
    portal: pre.portal,
    threadPropertyIds: await threadProperties(ctx, mail, text),
  });
  // Lo que se descartó por el TEXTO (no por los encabezados de lista o de rebote, que ya se filtraron arriba) lo escribió una
  // persona o lo parece: se guarda 14 días para poder marcarlo "Era una consulta". Antes sólo se guardaba el de "otra cosa", y
  // una consulta real tomada por promoción o basura no se podía rescatar. Las respuestas automáticas y los rebotes, nunca.
  const keepText = cls.category === "other" || cls.category === "newsletter" || cls.category === "spam";
  if (!isInquiry(cls.category)) return void (await ignore(cls.category, cls.reasons, cls.confidence, keepText));

  // ¿Puede salir sola?
  const [sentToday, repliesToSender, threadAnswered] = await Promise.all([
    MailMessage.countDocuments({ mailboxId: ctx.mailboxId, auto: true, status: { $in: ["queued", "sending", "sent"] }, updatedAt: { $gte: dayStart() } }),
    // Cuántas respuestas se le dieron a esta persona en el día (también las que confirmó una persona a mano).
    MailMessage.countDocuments({ mailboxId: ctx.mailboxId, "from.email": mail.from.email, status: { $in: ["queued", "sending", "sent"] }, createdAt: { $gte: new Date(Date.now() - DAY_MS) } }),
    MailMessage.exists({
      mailboxId: ctx.mailboxId,
      messageId: { $in: [mail.inReplyTo, ...mail.references].filter((x): x is string => !!x) },
      status: { $in: ["queued", "sending", "sent"] },
    }),
  ]);
  const decision = decideAuto({
    settings: ctx.settings,
    category: cls.category,
    confidence: cls.confidence,
    needsHuman: cls.needsHuman,
    // Sin la marca "pass" del servidor de origen no se responde sola: puede ser un remitente falso.
    authFailed: mail.auth !== "pass",
    // Los portales mandan desde una casilla "no-reply" con el mail del cliente en Reply-To: es lo esperado. En otro caso, no.
    replyElsewhere: !pre.portal && base.replyTo !== mail.from.email.toLowerCase(),
    availableProperties: selection.properties.length,
    // Lo que pide (si lo pide) tiene que coincidir con algo publicado: un reemplazo ("no hay, pero mirá esto") no cuenta.
    searchMatches: selection.fallback ? 0 : selection.alternatives.length,
    searchStrength: selection.search.strength,
    sentToday,
    repliesToSender,
    threadAnswered: !!threadAnswered,
    inherited: selection.inherited,
    unanswered,
    now: new Date(),
  });

  const draft = compose(decision.auto);
  const reasons = [...cls.reasons];
  if (cls.needsHuman) reasons.push(`Una persona tiene que revisar: ${cls.humanTopics.join(", ")}.`);
  if (ctx.settings.mode === "auto" && !decision.auto) reasons.push(`No salió sola: ${decision.why}`);

  let created;
  try {
    created = await MailMessage.create({
      ...base,
      text,
      category: cls.category,
      confidence: cls.confidence,
      reasons,
      needsHuman: cls.needsHuman,
      propertyIds: selection.properties.map((p) => new Types.ObjectId(p.id)),
      status: decision.auto ? "queued" : "awaiting_confirmation",
      auto: decision.auto,
      draft: { subject: draft.subject, body: draft.body },
      expiresAt: expiresIn(MAIL_LIMITS.retentionDays),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return; // ya se procesó antes
    throw err;
  }

  const first = selection.properties[0];
  if (first) {
    const leadId = await recordLead(ctx, { propertyId: first.id, name: mail.from.name, email: base.replyTo, text });
    if (leadId) await MailMessage.updateOne({ _id: created._id }, { $set: { leadId } });
  }

  if (decision.auto) {
    counts.queued++;
    return;
  }
  counts.drafts++;
  await createNotificationForMany(await agencyMemberIds(ctx.agencyId), {
    type: "mail_draft",
    title: "Hay una respuesta para confirmar.",
    body: `${mail.from.name || mail.from.email}: ${mail.subject}`.slice(0, 200),
    href: `/dashboard/agentes/correo?m=${created._id}`,
    dedupeKey: `mail:${created._id}`,
  });
}

/** Revisa un buzón. Nunca lanza: devuelve qué pasó. */
export async function pollMailbox(mailboxId: string, opts: { deadline: number }): Promise<PollOutcome> {
  const out: PollOutcome = { mailboxId, status: "ok", seen: 0, drafts: 0, queued: 0, ignored: 0, more: false };
  if (!Types.ObjectId.isValid(mailboxId)) return { ...out, status: "error", error: "Buzón inválido." };
  await connectDB();

  const now = new Date();
  const mailbox = await Mailbox.findOneAndUpdate(
    { _id: mailboxId, status: { $in: ["active", "error"] }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: "after" }
  ).select("+secret");
  if (!mailbox) return { ...out, status: "busy" };

  const agencyId = String(mailbox.agencyId);
  const release = (set: Record<string, unknown>) => Mailbox.updateOne({ _id: mailbox._id }, { $set: { lockedUntil: null, ...set } });

  try {
    const creds = openCreds(mailbox);

    const [settings, agency] = await Promise.all([loadSettings(agencyId), Agency.findById(agencyId).select("name").lean()]);
    const poll = await pollNew(creds, { uidValidity: mailbox.uidValidity ?? null, lastUid: mailbox.lastUid ?? 0 }, { deadline: opts.deadline });

    const ok = { status: "active", lastError: null, failCount: 0, lastPollAt: now, nextPollAt: new Date(now.getTime() + POLL_EVERY_MS), uidValidity: poll.uidValidity };
    if (poll.reset) {
      await release({ ...ok, lastUid: poll.lastUid });
      return { ...out, reset: true };
    }

    const ctx: PipelineCtx = { agencyId, agencyName: agency?.name ?? "la inmobiliaria", mailboxId: String(mailbox._id), ownEmail: mailbox.email, settings };
    const counts: Counts = { drafts: 0, queued: 0, ignored: 0 };
    let doneUid = mailbox.lastUid ?? 0;
    let failure: unknown = null;
    for (const mail of poll.mails) {
      try {
        await processMail(ctx, mail, counts);
        doneUid = mail.uid;
        out.seen++;
      } catch (err) {
        failure = err;
        break;
      }
    }
    // Si se cortó por la cantidad o por el tiempo, quedan mails; el cursor sólo llega hasta el último terminado.
    out.more = doneUid < poll.lastUid || (poll.mails.length >= MAIL_LIMITS.perPoll && doneUid < poll.uidNext - 1);
    await release({ ...ok, lastUid: doneUid, ...(out.more || failure ? { nextPollAt: now } : {}) });
    if (failure) console.error("mail processMail failed:", (failure as Error)?.message);
    return { ...out, ...counts, status: failure ? "error" : "ok", error: failure ? "No se pudo procesar un mail; se reintenta." : undefined };
  } catch (err) {
    const e = explain(err);
    const failCount = (mailbox.failCount ?? 0) + 1;
    const authFailed = e.code === "auth";
    const wait = BACKOFF_MIN[Math.min(failCount - 1, BACKOFF_MIN.length - 1)]! * 60_000;
    await release({
      status: authFailed ? "auth_failed" : failCount >= 3 ? "error" : "active",
      lastError: e.message.slice(0, 300),
      failCount,
      lastPollAt: now,
      nextPollAt: new Date(now.getTime() + wait),
    });
    if (authFailed || failCount === 3) {
      const owners = await agencyMemberIds(agencyId).catch(() => []);
      await createNotificationForMany(owners, {
        type: "mail_error",
        title: authFailed ? "El agente de correo no pudo entrar a tu casilla." : "El agente de correo tiene problemas para conectarse.",
        body: e.message.slice(0, 200),
        href: "/dashboard/agentes/correo",
        dedupeKey: `mail-error:${mailbox._id}:${now.toISOString().slice(0, 10)}`,
      });
    }
    return { ...out, status: "error", error: e.message };
  }
}

/** Notificación a una persona puntual (por ejemplo, el aviso de que una respuesta salió sola). */
export const notifyMail = createNotification;
