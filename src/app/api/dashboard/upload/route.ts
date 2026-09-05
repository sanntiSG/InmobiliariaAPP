import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { getStorageProvider } from "@/lib/storage";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";

const IMAGE_MAX_SIZE = 8 * 1024 * 1024; // 8MB
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

// Los navegadores no reportan un MIME consistente para estos formatos
// (muchos devuelven "" o "application/octet-stream") — se valida por
// extensión, no por file.type.
const MESH_MAX_SIZE = 30 * 1024 * 1024; // 30MB — el plan free de Cloudinary puede rechazar archivos grandes igual
const MESH_EXTENSIONS = [".glb", ".gltf", ".usdz"];

export async function POST(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) {
    return NextResponse.json({ error: "Primero creá tu inmobiliaria en /publicar." }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const kind = formData?.get("kind") === "mesh" ? "mesh" : "image";
  const requestedAgencyId = formData?.get("agencyId");

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

  if (kind === "mesh") {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!MESH_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "Formato no soportado. Usá .glb, .gltf o .usdz." }, { status: 400 });
    }
    if (file.size > MESH_MAX_SIZE) {
      return NextResponse.json({ error: "El archivo pesa más de 30MB." }, { status: 400 });
    }
  } else {
    if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado. Usá JPG, PNG, WEBP, AVIF o HEIC." },
        { status: 400 }
      );
    }
    if (file.size > IMAGE_MAX_SIZE) {
      return NextResponse.json({ error: "El archivo pesa más de 8MB." }, { status: 400 });
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = await getStorageProvider();
    const result = await provider.upload({
      buffer,
      filename: file.name,
      folder: `agencies/${agencyIdForFolder ?? "admin"}/properties`,
      resourceType: kind === "mesh" ? "raw" : "image",
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
