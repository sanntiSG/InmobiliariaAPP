import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AmbientCover } from "@/lib/db/models/AmbientCover";
import { AMBIENT_MANIFEST_MAX_BYTES, AMBIENT_MAX_UNATTACHED, ambientFolder } from "@/lib/ambient/constants";
import { AMBIENT_NO_STORE, ambientError, ambientGuard } from "@/lib/ambient/guard";
import { sweepUnattached } from "@/lib/ambient/server";
import type { AmbientSignResponse } from "@/lib/ambient/types";
import { AmbientValidationError, parseManifestText, referencedFiles, sanitizeManifest } from "@/lib/ambient/validate";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Sólo el admin elige la inmobiliaria; para el resto se ignora (siempre es la propia). */
  agencyId: z.string().optional(),
  /** Texto de `experience.json`, tal cual. El servidor lo valida de nuevo: no se confía en la validación del navegador. */
  manifestText: z.string().min(2).max(AMBIENT_MANIFEST_MAX_BYTES),
});

/**
 * Paso 1 de la subida de una portada viva. Valida el manifest y, si está bien, firma la subida DIRECTA a Cloudinary de
 * cada archivo que ese manifest necesita (ni uno más). La carpeta y los nombres los pone el servidor: el navegador no
 * elige dónde cae nada. Deja una portada `pending` registrada para que el paso 2 (`/register`) sepa qué verificar.
 * Sin Cloudinary (desarrollo) responde `local: true` y el navegador sube por `/api/dashboard/ambient/local`.
 */
export async function POST(req: Request) {
  const guard = await ambientGuard(req, "ambient-sign", 12);
  if (guard instanceof NextResponse) return guard;
  const { access } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return ambientError("Datos inválidos.", 400);

  const scope = agencyScope(access, parsed.data.agencyId);
  if (!scope?.agencyId) return ambientError("Elegí primero la inmobiliaria de la propiedad.", 400);
  const agencyId = scope.agencyId;

  try {
    await connectDB();
    if (access.isAdmin && !(await Agency.exists({ _id: agencyId }))) return ambientError("Inmobiliaria inválida.", 400);

    let manifest;
    try {
      manifest = parseManifestText(parsed.data.manifestText);
    } catch (err) {
      if (err instanceof AmbientValidationError) return ambientError(err.message, 400, { code: err.code });
      throw err;
    }

    await sweepUnattached(agencyId);
    if ((await AmbientCover.countDocuments({ agencyId, attachedTo: null })) >= AMBIENT_MAX_UNATTACHED) {
      return ambientError("Tenés varias portadas subidas que todavía no usaste en ninguna propiedad. Usá o quitá alguna antes de subir otra.", 409);
    }

    const coverId = randomUUID();
    const refs = referencedFiles(manifest);
    const folder = ambientFolder(agencyId, coverId);
    const provider = await getStorageProvider();

    const tickets: { name: string; uploadUrl: string; fields: Record<string, string> }[] = [];
    let local = false;
    for (const ref of refs) {
      const ticket = await provider.signDirectUpload({
        folder,
        extension: ref.name.slice(ref.name.lastIndexOf(".")),
        resourceType: "raw",
        fileName: ref.name,
      });
      if (!ticket) {
        local = true;
        break;
      }
      tickets.push({ name: ref.name, uploadUrl: ticket.uploadUrl, fields: ticket.fields });
    }

    await AmbientCover.create({
      agencyId,
      coverId,
      status: "pending",
      manifest: sanitizeManifest(manifest, coverId),
      baseUrl: provider.folderUrl(folder),
      bytes: refs.reduce((sum, r) => sum + r.bytes, 0),
    });

    const body: AmbientSignResponse = local ? { coverId, local: true, names: refs.map((r) => r.name) } : { coverId, local: false, tickets };
    return NextResponse.json(body, { headers: AMBIENT_NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/ambient/sign failed:", err);
    return ambientError("No se pudo preparar la subida. Probá de nuevo en un momento.", 503);
  }
}
