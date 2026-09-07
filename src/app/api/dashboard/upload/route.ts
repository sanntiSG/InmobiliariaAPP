import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { getStorageProvider } from "@/lib/storage";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";

const IMAGE_MAX_SIZE = 8 * 1024 * 1024; // 8MB
// La foto 360° necesita menos compresión (se ve de cerca, con zoom dentro
// de la esfera) — se le permite pesar más, hasta el techo real de
// Cloudinary free para imágenes.
const PHOTO360_MAX_SIZE = 10 * 1024 * 1024; // 10MB
// HEIC/HEIF: formato nativo de fotos de iPhone — Cloudinary lo acepta como
// input y lo convierte a un formato web con `fetch_format: "auto"` (ver
// cloudinary.ts), así que alcanza con no rechazarlo acá.
const IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
];

export async function POST(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) {
    return NextResponse.json({ error: "Primero creá tu inmobiliaria en /publicar." }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const requestedAgencyId = formData?.get("agencyId");
  const isPhoto360 = formData?.get("kind") === "photo360";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }

  // Scope de la carpeta de destino: la propia agencia, o —solo para el
  // admin— la agencia que esté editando (para no mezclar todo bajo "admin").
  let agencyIdForFolder = access.agencyId;
  if (access.isAdmin && typeof requestedAgencyId === "string" && requestedAgencyId) {
    if (!Types.ObjectId.isValid(requestedAgencyId)) {
      return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
    }
    await connectDB();
    const exists = await Agency.exists({ _id: requestedAgencyId });
    if (!exists) return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
    agencyIdForFolder = requestedAgencyId;
  }

  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato no soportado. Usá JPG, PNG, WEBP, AVIF o HEIC." },
      { status: 400 }
    );
  }
  const maxSize = isPhoto360 ? PHOTO360_MAX_SIZE : IMAGE_MAX_SIZE;
  if (file.size > maxSize) {
    return NextResponse.json({ error: `El archivo pesa más de ${maxSize / (1024 * 1024)}MB.` }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = await getStorageProvider();
    const result = await provider.upload({
      buffer,
      filename: file.name,
      folder: `agencies/${agencyIdForFolder ?? "admin"}/properties`,
      quality: isPhoto360 ? "best" : "auto",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/upload failed:", err);
    // El SDK de Cloudinary devuelve un mensaje útil (tamaño, tipo de recurso
    // no permitido en el plan, etc.) — mostrarlo evita un "no se pudo
    // subir" genérico que no dice si el problema es del archivo o de la cuenta.
    const detail = err instanceof Error && err.message ? err.message : null;
    return NextResponse.json(
      { error: detail ? `No se pudo subir el archivo: ${detail}` : "No se pudo subir el archivo." },
      { status: 503 }
    );
  }
}
