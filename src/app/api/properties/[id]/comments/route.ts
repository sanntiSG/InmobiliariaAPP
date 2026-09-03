import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Comment } from "@/lib/db/models/Comment";
import { Interaction } from "@/lib/db/models/Interaction";
import { Like } from "@/lib/db/models/Like";
import { Favorite } from "@/lib/db/models/Favorite";
import { requireUser } from "@/lib/auth/require-user";
import { createNotificationForMany } from "@/lib/notifications/create";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Escribí algo").max(1000),
  parentId: z.string().length(24).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = 20;

  try {
    await connectDB();
    const [docs, total] = await Promise.all([
      Comment.find({ propertyId: id, deletedAt: null })
        .populate({ path: "userId", select: "name image" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Comment.countDocuments({ propertyId: id, deletedAt: null }),
    ]);

    const items = docs.map((c) => ({
      id: String(c._id),
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId ? String(c.parentId) : null,
      user: {
        id: String((c.userId as unknown as { _id: unknown })._id),
        name: (c.userId as unknown as { name: string }).name,
      },
    }));

    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("GET /api/properties/[id]/comments failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar los comentarios.", items: [], total: 0 }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  try {
    await connectDB();
    const property = await Property.findById(id).select("agencyId title slug");
    if (!property) return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });

    const comment = await Comment.create({
      propertyId: id,
      userId: user.id,
      body: parsed.data.body,
      parentId: parsed.data.parentId ?? null,
    });
    await Property.updateOne({ _id: id }, { $inc: { "stats.comments": 1 } });
    await Interaction.create({ type: "comment", userId: user.id, propertyId: id, agencyId: property.agencyId });

    after(() => notifyInterestedUsers(id, user.id, property.title, property.slug));

    return NextResponse.json(
      {
        id: String(comment._id),
        body: comment.body,
        createdAt: comment.createdAt,
        parentId: comment.parentId ? String(comment.parentId) : null,
        user: { id: user.id, name: user.name ?? "Vos" },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/properties/[id]/comments failed:", err);
    return NextResponse.json({ error: "No se pudo publicar el comentario." }, { status: 503 });
  }
}

/** Avisa a quienes likearon/guardaron la propiedad (menos a quien comentó). */
async function notifyInterestedUsers(propertyId: string, commenterId: string, title: string, slug: string) {
  try {
    await connectDB();
    const [likes, favorites] = await Promise.all([
      Like.find({ propertyId }).select("userId").lean(),
      Favorite.find({ propertyId }).select("userId").lean(),
    ]);
    const userIds = [...new Set([...likes, ...favorites].map((d) => String(d.userId)))].filter(
      (id) => id !== commenterId
    );
    await createNotificationForMany(userIds, {
      type: "activity",
      title: "Nuevo comentario en una propiedad que seguís",
      body: title,
      href: `/propiedades/${slug}`,
      propertyId,
    });
  } catch (err) {
    console.error("notifyInterestedUsers failed:", err);
  }
}
