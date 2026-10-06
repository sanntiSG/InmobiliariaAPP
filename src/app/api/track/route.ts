import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Interaction } from "@/lib/db/models/Interaction";
import { auth } from "@/auth";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { dayStart, recordEvent } from "@/lib/tracking/record";

/** Cookie de visitante anónimo (no identifica a nadie, sólo permite contar visitantes únicos). */
const VISITOR_COOKIE = "rid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VIEW_DEDUPE_MS = 30 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor/i;

const bodySchema = z.object({
  propertyId: z.string().length(24),
  event: z.enum(["view", "dwell", "share", "contact", "tour_open", "tour_scene"]),
  /** Sólo `dwell`: milisegundos. */
  value: z.number().int().min(0).max(30 * 60_000).optional(),
  /** Sólo `tour_scene`. */
  sceneId: z.string().trim().min(1).max(80).optional(),
  /** Sólo `contact`. */
  channel: z.enum(["whatsapp", "phone", "email"]).optional(),
  /** Sólo `share`. */
  method: z.enum(["native", "copy", "whatsapp"]).optional(),
});

/**
 * Receptor de eventos del cliente (vista, permanencia, compartir, contacto,
 * recorrido 360°). Se llama con `navigator.sendBeacon`, así que nunca bloquea
 * la navegación. Responde 204 siempre que el evento sea válido — también
 * cuando se descarta (bot, duplicado, límite) — para no dar señales útiles
 * a quien intente inflar métricas.
 */
export async function POST(req: NextRequest) {
  if (BOT_RE.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !Types.ObjectId.isValid(parsed.data.propertyId)) {
    return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  }
  const body = parsed.data;

  const existingRid = req.cookies.get(VISITOR_COOKIE)?.value;
  const rid = existingRid && UUID_RE.test(existingRid) ? existingRid : crypto.randomUUID();

  const respond = () => {
    const res = new NextResponse(null, { status: 204 });
    if (rid !== existingRid) {
      res.cookies.set(VISITOR_COOKIE, rid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }
    return res;
  };

  const [byVisitor, byIp] = await Promise.all([
    rateLimit(`track:rid:${rid}`, 120, 60),
    rateLimit(`track:ip:${clientIp(req)}`, 400, 60),
  ]);
  if (!byVisitor.ok || !byIp.ok) return respond();

  try {
    await connectDB();
    const property = await Property.findById(body.propertyId).select("agencyId status").lean();
    if (!property || property.status !== "published") return respond();

    const session = await auth().catch(() => null);
    const userId = session?.user?.id ?? null;
    const base = { propertyId: property._id, agencyId: property.agencyId, userId, anonId: rid };

    if (body.event === "view") {
      const now = Date.now();
      const lastView = await Interaction.findOne({
        type: "view",
        propertyId: property._id,
        anonId: rid,
        createdAt: { $gte: new Date(now - VIEW_DEDUPE_MS) },
      })
        .select("_id")
        .lean();
      if (lastView) return respond();

      const seenToday = await Interaction.exists({
        type: "view",
        propertyId: property._id,
        anonId: rid,
        createdAt: { $gte: dayStart() },
      });
      await Promise.all([
        recordEvent({ ...base, type: "view", unique: !seenToday }),
        Property.updateOne({ _id: property._id }, { $inc: { "stats.views": 1 } }),
      ]);
    } else if (body.event === "dwell") {
      if (body.value) await recordEvent({ ...base, type: "dwell", valueMs: body.value });
    } else if (body.event === "tour_scene") {
      if (body.sceneId) await recordEvent({ ...base, type: "tour_scene", sceneId: body.sceneId });
    } else if (body.event === "contact") {
      await recordEvent({ ...base, type: "contact", meta: { channel: body.channel ?? null } });
    } else if (body.event === "share") {
      await recordEvent({ ...base, type: "share", meta: { method: body.method ?? null } });
    } else {
      await recordEvent({ ...base, type: "tour_open" });
    }
  } catch (err) {
    console.error("POST /api/track failed:", err);
  }

  return respond();
}
