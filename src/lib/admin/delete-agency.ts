import { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyDeletionNotice } from "@/lib/db/models/AgencyDeletionNotice";
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
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";
import { SocialContent } from "@/lib/db/models/SocialContent";
import { Rating } from "@/lib/db/models/Rating";
import { User } from "@/lib/db/models/User";
import { getStorageProvider } from "@/lib/storage";
import { purgeUsers } from "./purge-user";

export type DeleteAgencySummary = {
  properties: number;
  clients: number;
  accounts: number;
  files: number;
};

/**
 * Elimina una inmobiliaria y TODO lo que depende de ella: propiedades (con sus
 * me gusta, favoritos, puntajes, comentarios y estadísticas), fotos y recorridos
 * 360° subidos (también el logo y la portada), clientes potenciales,
 * seguidores, permisos, solicitudes y las **cuentas completas** de quienes la
 * gestionaban (ver `purgeUsers`). Esas personas pueden volver a registrarse,
 * pero empiezan de cero y deben pedir permiso otra vez.
 *
 * Los pasos son idempotentes y la inmobiliaria se borra AL FINAL: si algo
 * falla a mitad de camino, se puede reintentar y la cascada sigue encontrando
 * al equipo y las propiedades que quedaron. Devuelve `null` si no existe.
 */
export async function deleteAgencyCascade(agencyId: string): Promise<DeleteAgencySummary | null> {
  const agency = await Agency.findById(agencyId).select("owners name").lean();
  if (!agency) return null;
  const agencyOid = new Types.ObjectId(agencyId);

  // — Equipo: quienes tienen esa agencia, figuran como dueños o recibieron el permiso por email (nunca un admin) —
  const allowed = await AllowedEmail.find({ agencyId: agencyOid }).select("email").lean();
  const allowedEmails = allowed.map((a) => a.email);
  const members = await User.find({
    role: { $ne: "admin" },
    $or: [{ agencyId: agencyOid }, { _id: { $in: agency.owners ?? [] } }, { email: { $in: allowedEmails } }],
  })
    .select("_id email")
    .lean();

  // — Aviso para quienes vuelvan a entrar: se crea ANTES de purgar las cuentas
  // (después ya no habría a quién avisar). Una vez por email, aunque se reintente. —
  const noticeEmails = [...new Set([...members.map((m) => m.email), ...allowedEmails])].filter(Boolean);
  for (const email of noticeEmails) {
    await AgencyDeletionNotice.updateOne(
      { email, agencyName: agency.name, seenAt: null },
      { $setOnInsert: { deletedAt: new Date() } },
      { upsert: true }
    );
  }

  // — Propiedades y todo lo que cuelga de ellas —
  const propertyIds = await Property.find({ agencyId: agencyOid }).distinct("_id");
  if (propertyIds.length > 0) {
    await Promise.all([
      Like.deleteMany({ propertyId: { $in: propertyIds } }),
      Favorite.deleteMany({ propertyId: { $in: propertyIds } }),
      Rating.deleteMany({ propertyId: { $in: propertyIds } }),
      Comment.deleteMany({ propertyId: { $in: propertyIds } }),
      PropertyDailyStat.deleteMany({ propertyId: { $in: propertyIds } }),
      Notification.deleteMany({ propertyId: { $in: propertyIds } }),
    ]);
  }
  const [leads] = await Promise.all([
    Lead.deleteMany({ agencyId: agencyOid }),
    Interaction.deleteMany({ $or: [{ agencyId: agencyOid }, { propertyId: { $in: propertyIds } }] }),
    AgencyFollow.deleteMany({ agencyId: agencyOid }),
    PropertyDailyStat.deleteMany({ agencyId: agencyOid }),
    SocialContent.deleteMany({ agencyId: agencyOid }),
  ]);

  // — Archivos subidos (mejor esfuerzo: un fallo del storage no frena la limpieza de la base) —
  const files = await getStorageProvider()
    .then((provider) => provider.deleteAgencyAssets(agencyId))
    .catch((err) => {
      console.error("deleteAgencyCascade: no se pudieron borrar los archivos:", err);
      return 0;
    });

  const removedProperties = await Property.deleteMany({ agencyId: agencyOid });

  // — Permisos, solicitudes y cuentas del equipo —
  await AllowedEmail.deleteMany({ agencyId: agencyOid });
  const purge = await purgeUsers(members.map((m) => String(m._id)));
  await AgencyRequest.deleteMany({ email: { $in: allowedEmails } });

  await Agency.deleteOne({ _id: agencyOid });

  return {
    properties: removedProperties.deletedCount,
    clients: leads.deletedCount,
    accounts: purge.accounts,
    files,
  };
}
