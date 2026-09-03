import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Comment } from "@/lib/db/models/Comment";
import { Property } from "@/lib/db/models/Property";
import { requireUser } from "@/lib/auth/require-user";

export async function DELETE(_req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { commentId } = await params;
  if (!Types.ObjectId.isValid(commentId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const comment = await Comment.findById(commentId);
    if (!comment || comment.deletedAt) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const isOwner = String(comment.userId) === user.id;
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    comment.deletedAt = new Date();
    await comment.save();
    await Property.updateOne({ _id: comment.propertyId }, { $inc: { "stats.comments": -1 } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/comments/[commentId] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar el comentario." }, { status: 503 });
  }
}
