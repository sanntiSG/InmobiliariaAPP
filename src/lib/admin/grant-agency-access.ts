import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db/connect";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";
import { createNotification } from "@/lib/notifications/create";

/** Error con status HTTP — las rutas lo atrapan y lo devuelven tal cual al cliente. */
export class GrantAccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type GrantAgencyAccessInput = {
  email: string;
  /** `null` = el email queda habilitado sin inmobiliaria — la persona crea la suya en /publicar. */
  agencyId: string | null;
  role: "agency_owner" | "agency_agent";
  /** Admin que concede el permiso (`AllowedEmail.grantedBy`). */
  grantedByUserId: string;
  /** Si viene, además crea una cuenta con login por contraseña (nombre + contraseña). */
  ownerName?: string;
  ownerPassword?: string;
};

/**
 * Autoriza un email a gestionar una inmobiliaria — única función que hace
 * esto en la app (antes duplicada, y desalineada, entre
 * `POST /api/admin/agencies` y `POST /api/admin/allowed-emails`).
 *
 * Siempre:
 * 1. upsertea la fila en `AllowedEmail` (fuente de verdad de permisos, ver
 *    `resolveAccessForEmail`);
 * 2. si ya existe (o se crea acá) un `User` con ese email, lo promueve al
 *    rol pedido, lo agrega a `Agency.owners` y le manda una notificación
 *    interna — así no hace falta esperar a que vuelva a iniciar sesión.
 */
export async function grantAgencyAccess(
  input: GrantAgencyAccessInput
): Promise<{ createdUser: boolean; allowedEmailId: string }> {
  await connectDB();

  const email = input.email.toLowerCase();
  const { agencyId, role, grantedByUserId, ownerName, ownerPassword } = input;

  const existingGrant = await AllowedEmail.findOne({ email }).lean();
  if (existingGrant) {
    throw new GrantAccessError(409, "Ese email ya está autorizado.");
  }

  let user = await User.findOne({ email });

  // No pisar al admin de la plataforma si por error se intenta autorizar su email.
  if (user?.role === "admin") {
    throw new GrantAccessError(409, "Ese email ya es admin de la plataforma.");
  }

  let createdUser = false;
  if (ownerPassword) {
    if (user) {
      throw new GrantAccessError(
        409,
        "Ya existe una cuenta con ese email — dejá la contraseña vacía para solo darle acceso (va a entrar con Google)."
      );
    }
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    user = await User.create({
      name: ownerName || email,
      email,
      passwordHash,
      role,
      agencyId,
    });
    createdUser = true;
  }

  // pending: nunca inició sesión. awaiting_agency: ya inició sesión (o se le
  // creó la cuenta acá) pero falta inmobiliaria. active: ya tiene las dos cosas.
  const status = !user ? "pending" : agencyId ? "active" : "awaiting_agency";

  const record = await AllowedEmail.create({ email, agencyId, role, grantedBy: grantedByUserId, status });

  if (user) {
    if (!createdUser) {
      await User.updateOne({ _id: user._id }, { $set: { role, agencyId } });
    }
    if (agencyId) {
      await Agency.updateOne({ _id: agencyId }, { $addToSet: { owners: user._id } });
    }
    await createNotification({
      userId: String(user._id),
      type: "system",
      title: agencyId ? "Ya podés gestionar tu inmobiliaria" : "Ya podés publicar tu inmobiliaria",
      body: agencyId
        ? "El admin te dio acceso para administrar una inmobiliaria en la plataforma."
        : "El admin te habilitó — creá tu inmobiliaria para empezar a publicar propiedades.",
      href: agencyId ? "/dashboard" : "/publicar",
    });
  }

  return { createdUser, allowedEmailId: String(record._id) };
}
