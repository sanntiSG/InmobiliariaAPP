import { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFollow } from "@/lib/db/models/AgencyFollow";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Comment } from "@/lib/db/models/Comment";
import { Favorite } from "@/lib/db/models/Favorite";
import { Interaction } from "@/lib/db/models/Interaction";
import { Lead } from "@/lib/db/models/Lead";
import { Like } from "@/lib/db/models/Like";
import { Notification } from "@/lib/db/models/Notification";
import { Property } from "@/lib/db/models/Property";
import { Rating } from "@/lib/db/models/Rating";
import { SavedSearch } from "@/lib/db/models/SavedSearch";
import { User } from "@/lib/db/models/User";
import { UserTasteProfile } from "@/lib/db/models/UserTasteProfile";

const oid = (id: unknown) => new Types.ObjectId(String(id));

/** Cuántos documentos agrupados por una clave: `[{_id: clave, n}]` → `Map<clave, n>`. */
const toCounts = (rows: { _id: unknown; n: number }[]) => new Map(rows.map((r) => [String(r._id), r.n]));

export type PurgeSummary = { accounts: number };

/**
 * Elimina cuentas de usuario y TODO lo suyo: favoritos, me gusta, comentarios,
 * puntajes, seguimientos, notificaciones, perfil de gustos, búsquedas
 * guardadas, solicitudes de inmobiliaria y permisos. Corrige los contadores
 * desnormalizados que esa actividad había sumado (guardados, me gusta y
 * comentarios de las propiedades; puntaje promedio; seguidores de las
 * inmobiliarias) para que las estadísticas de otros no queden infladas.
 *
 * Lo que es dato de OTRA inmobiliaria o estadística agregada (consultas
 * recibidas, eventos del log) NO se borra: sólo se desvincula de la persona.
 * Nunca elimina a un admin.
 */
export async function purgeUsers(userIds: string[]): Promise<PurgeSummary> {
  const targets = await User.find({ _id: { $in: userIds.map(oid) }, role: { $ne: "admin" } })
    .select("_id email")
    .lean();
  if (targets.length === 0) return { accounts: 0 };

  const ids = targets.map((u) => u._id);
  const emails = targets.map((u) => u.email);

  // — Contadores de las propiedades: restar lo que esta gente había sumado —
  const [favorites, likes, comments, ratedRows, follows] = await Promise.all([
    Favorite.aggregate<{ _id: unknown; n: number }>([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: "$propertyId", n: { $sum: 1 } } },
    ]),
    Like.aggregate<{ _id: unknown; n: number }>([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: "$propertyId", n: { $sum: 1 } } },
    ]),
    Comment.aggregate<{ _id: unknown; n: number }>([
      { $match: { userId: { $in: ids }, deletedAt: null } },
      { $group: { _id: "$propertyId", n: { $sum: 1 } } },
    ]),
    Rating.find({ userId: { $in: ids } }).select("propertyId").lean(),
    AgencyFollow.aggregate<{ _id: unknown; n: number }>([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: "$agencyId", n: { $sum: 1 } } },
    ]),
  ]);

  const saveCounts = toCounts(favorites);
  const likeCounts = toCounts(likes);
  const commentCounts = toCounts(comments);
  const touched = new Set([...saveCounts.keys(), ...likeCounts.keys(), ...commentCounts.keys()]);

  const propertyOps = [...touched].map((propertyId) => ({
    updateOne: {
      filter: { _id: oid(propertyId) },
      update: {
        $inc: {
          "stats.saves": -(saveCounts.get(propertyId) ?? 0),
          "stats.likes": -(likeCounts.get(propertyId) ?? 0),
          "stats.comments": -(commentCounts.get(propertyId) ?? 0),
        },
      },
    },
  }));
  if (propertyOps.length > 0) await Property.bulkWrite(propertyOps);

  if (follows.length > 0) {
    await Agency.bulkWrite(
      follows.map((f) => ({
        updateOne: { filter: { _id: oid(f._id) }, update: { $inc: { "stats.followers": -f.n } } },
      }))
    );
  }

  // — Borrar la actividad —
  await Promise.all([
    Favorite.deleteMany({ userId: { $in: ids } }),
    Like.deleteMany({ userId: { $in: ids } }),
    Comment.deleteMany({ userId: { $in: ids } }),
    Rating.deleteMany({ userId: { $in: ids } }),
    AgencyFollow.deleteMany({ userId: { $in: ids } }),
    Notification.deleteMany({ userId: { $in: ids } }),
    UserTasteProfile.deleteMany({ userId: { $in: ids } }),
    SavedSearch.deleteMany({ userId: { $in: ids } }),
    AgencyRequest.deleteMany({ $or: [{ userId: { $in: ids } }, { email: { $in: emails } }] }),
    AllowedEmail.deleteMany({ email: { $in: emails } }),
    // Lo que es de otras inmobiliarias o estadística agregada se conserva, sin la identidad.
    Interaction.updateMany({ userId: { $in: ids } }, { $set: { userId: null } }),
    Lead.updateMany({ userId: { $in: ids } }, { $set: { userId: null } }),
    Agency.updateMany({ owners: { $in: ids } }, { $pull: { owners: { $in: ids } } }),
  ]);

  // — Recalcular el puntaje promedio de las propiedades que esta gente había calificado —
  const ratedPropertyIds = [...new Set(ratedRows.map((r) => String(r.propertyId)))].map(oid);
  if (ratedPropertyIds.length > 0) {
    const agg = await Rating.aggregate<{ _id: Types.ObjectId; avg: number; count: number }>([
      { $match: { propertyId: { $in: ratedPropertyIds } } },
      { $group: { _id: "$propertyId", avg: { $avg: "$value" }, count: { $sum: 1 } } },
    ]);
    const byProperty = new Map(agg.map((a) => [String(a._id), a]));
    await Property.bulkWrite(
      ratedPropertyIds.map((id) => {
        const a = byProperty.get(String(id));
        return {
          updateOne: {
            filter: { _id: id },
            update: { $set: { "stats.ratingAvg": a ? Math.round(a.avg * 10) / 10 : 0, "stats.ratingCount": a?.count ?? 0 } },
          },
        };
      })
    );
  }

  const removed = await User.deleteMany({ _id: { $in: ids } });
  return { accounts: removed.deletedCount };
}
