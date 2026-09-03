import { NextResponse } from "next/server";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { getStorageProvider } from "@/lib/storage";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function POST(req: Request) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usá JPG, PNG, WEBP o AVIF." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo pesa más de 8MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = await getStorageProvider();
    const result = await provider.upload({
      buffer,
      filename: file.name,
      folder: `agencies/${agencyUser.agencyId}/properties`,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/upload failed:", err);
    return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 503 });
  }
}
