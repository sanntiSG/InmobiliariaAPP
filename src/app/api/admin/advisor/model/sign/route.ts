import { NextResponse } from "next/server";
import { z } from "zod";
import { LIBRARY_FULL, NO_STORE, adminGuard, libraryCount } from "@/lib/advisor/admin";
import { MAX_LIBRARY, MODEL_MAX_BYTES } from "@/lib/advisor/config";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  filename: z.string().trim().min(1).max(200),
  bytes: z.number().int().positive(),
});

/**
 * Firma una subida DIRECTA del navegador a Cloudinary (los modelos pesan varios MB y las funciones
 * serverless tienen un tope de payload mucho menor). La carpeta y el nombre los pone el servidor.
 * Sin Cloudinary (desarrollo local) responde `local: true` y el cliente sube por `/model/local`.
 */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  const { filename, bytes } = parsed.data;

  if (!/\.glb$/i.test(filename)) return NextResponse.json({ error: "El modelo tiene que ser un archivo .glb." }, { status: 400, headers: NO_STORE });
  if (bytes > MODEL_MAX_BYTES) {
    return NextResponse.json({ error: `El modelo pesa más de ${MODEL_MAX_BYTES / (1024 * 1024)} MB.` }, { status: 400, headers: NO_STORE });
  }
  if ((await libraryCount()) >= MAX_LIBRARY) return NextResponse.json({ error: LIBRARY_FULL }, { status: 409, headers: NO_STORE });

  try {
    const provider = await getStorageProvider();
    const ticket = await provider.signDirectUpload({ folder: "advisor", extension: ".glb", resourceType: "raw" });
    if (!ticket) return NextResponse.json({ local: true }, { headers: NO_STORE });
    return NextResponse.json({ local: false, ticket }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/model/sign failed:", err);
    return NextResponse.json({ error: "No se pudo preparar la subida." }, { status: 503, headers: NO_STORE });
  }
}
