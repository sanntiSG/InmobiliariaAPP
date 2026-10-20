import { NextResponse } from "next/server";
import { z } from "zod";
import { LIBRARY_FULL, NO_STORE, addToLibrary, adminGuard, isGlb, libraryCount } from "@/lib/advisor/admin";
import { MAX_LIBRARY, MODEL_MAX_BYTES, getAdminConfigState } from "@/lib/advisor/config";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const clipsSchema = z.array(z.object({ name: z.string().trim().min(1).max(60), duration: z.number().min(0).max(600) })).max(30);

/**
 * Subida por el servidor, SÓLO para desarrollo sin Cloudinary (guarda en /public/uploads). Con
 * Cloudinary configurado se usa la subida firmada directa y esta ruta se rechaza.
 */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;

  const provider = await getStorageProvider();
  if (await provider.signDirectUpload({ folder: "advisor", extension: ".glb", resourceType: "raw" })) {
    return NextResponse.json({ error: "Usá la subida directa." }, { status: 409, headers: NO_STORE });
  }
  if ((await libraryCount()) >= MAX_LIBRARY) return NextResponse.json({ error: LIBRARY_FULL }, { status: 409, headers: NO_STORE });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !/\.glb$/i.test(file.name)) {
    return NextResponse.json({ error: "Falta el archivo .glb." }, { status: 400, headers: NO_STORE });
  }
  if (file.size > MODEL_MAX_BYTES) {
    return NextResponse.json({ error: `El modelo pesa más de ${MODEL_MAX_BYTES / (1024 * 1024)} MB.` }, { status: 400, headers: NO_STORE });
  }
  const clips = clipsSchema.safeParse(JSON.parse(String(form?.get("clips") ?? "[]")));
  if (!clips.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isGlb(buffer.subarray(0, 4))) return NextResponse.json({ error: "El archivo no es un modelo .glb válido." }, { status: 400, headers: NO_STORE });
    const result = await provider.upload({ buffer, filename: file.name, folder: "advisor", resourceType: "raw" });
    await addToLibrary({ url: result.url, providerId: result.providerId, bytes: buffer.length, label: file.name.slice(0, 80), clips: clips.data });
    return NextResponse.json(await getAdminConfigState(), { status: 201, headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/model/local failed:", err);
    return NextResponse.json({ error: "No se pudo subir el modelo." }, { status: 503, headers: NO_STORE });
  }
}
