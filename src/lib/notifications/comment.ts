import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Comment } from "@/lib/db/models/Comment";
import { Favorite } from "@/lib/db/models/Favorite";
import { Like } from "@/lib/db/models/Like";
import { todayAr } from "@/lib/availability";
import { createNotification, createNotificationForMany } from "./create";
import { notifyAgencySocial } from "./social";

export type CommentNotice = {
  propertyId: string;
  agencyId: string;
  commentId: string;
  parentId: string | null;
  commenterId: string;
  text: string;
  title: string;
  slug: string;
};

/**
 * Quién se entera de un comentario nuevo, sin avisarle dos veces a la misma persona:
 * 1. la inmobiliaria (siempre; lo propio no cuenta);
 * 2. si responde a otro comentario, el autor de ese comentario (el aviso que más importa);
 * 3. quienes le dieron me gusta o la guardaron, como mucho una vez por propiedad y por día (un hilo animado no los inunda).
 */
export async function notifyComment(n: CommentNotice) {
  try {
    await connectDB();
    const href = `/propiedades/${n.slug}`;

    await notifyAgencySocial({
      event: "property_comment",
      agencyId: n.agencyId,
      propertyId: n.propertyId,
      propertyTitle: n.title,
      text: n.text,
      commentId: n.commentId,
      actorUserId: n.commenterId,
    });

    const told = new Set<string>([n.commenterId]);
    if (n.parentId && Types.ObjectId.isValid(n.parentId)) {
      // Sólo cuenta si el comentario original es de ESTA propiedad (el id viene del navegador y no se confía).
      const parent = await Comment.findOne({ _id: n.parentId, propertyId: n.propertyId, deletedAt: null }).select("userId").lean();
      const parentAuthor = parent ? String(parent.userId) : null;
      if (parentAuthor && parentAuthor !== n.commenterId) {
        told.add(parentAuthor);
        await createNotification({
          userId: parentAuthor,
          type: "comment_reply",
          title: "Respondieron tu comentario",
          body: `«${n.title}»: ${n.text.replace(/\s+/g, " ").trim().slice(0, 100)}`,
          href,
          propertyId: n.propertyId,
          dedupeKey: `reply:${n.commentId}`,
        });
      }
    }

    const [likes, favorites] = await Promise.all([
      Like.find({ propertyId: n.propertyId }).select("userId").limit(5000).lean(),
      Favorite.find({ propertyId: n.propertyId }).select("userId").limit(5000).lean(),
    ]);
    const userIds = [...new Set([...likes, ...favorites].map((d) => String(d.userId)))].filter((id) => !told.has(id));
    await createNotificationForMany(userIds, {
      type: "activity",
      title: "Nuevo comentario en una propiedad que seguís",
      body: n.title,
      href,
      propertyId: n.propertyId,
      dedupeKey: `activity:comment:${n.propertyId}:${todayAr()}`,
    });
  } catch (err) {
    console.error("notifyComment failed:", err);
  }
}
