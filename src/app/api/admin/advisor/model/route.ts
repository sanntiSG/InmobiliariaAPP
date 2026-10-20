import { NextResponse } from "next/server";
import { z } from "zod";
import { LIBRARY_FULL, NO_STORE, addToLibrary, adminGuard, isGlb, libraryCount, modelInUse, removeFromLibrary } from "@/lib/advisor/admin";
import { MAX_LIBRARY, MODEL_MAX_BYTES, getAdminConfigState, isAllowedModelUrl } from "@/lib/advisor/config";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const clipsSchema = z.array(z.object({ name: z.string().trim().min(1).max(60), duration: z.number().min(0).max(600) })).max(30);

const registerSchema = z.object({
  providerId: z.string().regex(/^umbral\/advisor\/[0-9a-f-]{36}\.glb$/i),
  label: z.string().trim().max(80).optional(),
  clips: clipsSchema,
});

/**
 * Registra un modelo que el navegador ya subió (firmado) a Cloudinary. Antes de aceptarlo se verifica
 * en el servidor, no en el cliente: que exista en NUESTRA carpeta, que no pase el tope de peso y que
 * de verdad sea un glTF binario. Si algo falla, el archivo se borra.
 */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  const { providerId, label, clips } = parsed.data;

  if ((await libraryCount()) >= MAX_LIBRARY) return NextResponse.json({ error: LIBRARY_FULL }, { status: 409, headers: NO_STORE });

  try {
    const provider = await getStorageProvider();
    const info = await provider.inspect(providerId, "raw");
    if (!info) return NextResponse.json({ error: "No encuentro el archivo subido." }, { status: 400, headers: NO_STORE });

    const reject = async (error: string) => {
      await provider.delete(providerId, "raw").catch(() => {});
      return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
    };
    if (info.bytes > MODEL_MAX_BYTES) return reject(`El modelo pesa más de ${MODEL_MAX_BYTES / (1024 * 1024)} MB.`);
    if (!isAllowedModelUrl(info.url)) return reject("El archivo no quedó en la carpeta del asesor.");

    // Los primeros 4 bytes tienen que ser "glTF".
    const head = await fetch(info.url, { headers: { Range: "bytes=0-3" }, cache: "no-store" })
      .then(async (r) => new Uint8Array((await r.arrayBuffer()).slice(0, 4)))
      .catch(() => new Uint8Array());
    if (!isGlb(head)) return reject("El archivo no es un modelo .glb válido.");

    await addToLibrary({ url: info.url, providerId, bytes: info.bytes, label, clips });
    return NextResponse.json(await getAdminConfigState(), { status: 201, headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/model failed:", err);
    return NextResponse.json({ error: "No se pudo registrar el modelo." }, { status: 503, headers: NO_STORE });
  }
}

const deleteSchema = z.object({ providerId: z.string().min(1).max(300) });

/** Borra un modelo subido. No se puede borrar uno que esté en uso (borrador o publicado) ni el incluido. */
export async function DELETE(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  const { providerId } = parsed.data;

  try {
    const state = await getAdminConfigState();
    const entry = state.library.find((l) => l.providerId === providerId);
    if (!entry) return NextResponse.json({ error: "No existe ese modelo." }, { status: 404, headers: NO_STORE });
    if (await modelInUse(entry.url)) {
      return NextResponse.json({ error: "Ese modelo está en uso. Elegí otro (y publicá) antes de borrarlo." }, { status: 409, headers: NO_STORE });
    }
    await removeFromLibrary(providerId);
    const provider = await getStorageProvider();
    await provider.delete(providerId, "raw").catch((e) => console.error("delete advisor model failed:", e));
    return NextResponse.json(await getAdminConfigState(), { headers: NO_STORE });
  } catch (err) {
    console.error("DELETE /api/admin/advisor/model failed:", err);
    return NextResponse.json({ error: "No se pudo borrar el modelo." }, { status: 503, headers: NO_STORE });
  }
}
