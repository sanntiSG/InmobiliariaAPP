import { NextResponse } from "next/server";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { getStorageProvider } from "@/lib/storage";

const IMAGE_MAX_SIZE = 8 * 1024 * 1024; // 8MB
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// Los navegadores no reportan un MIME consistente para estos formatos
// (muchos devuelven "" o "application/octet-stream") — se valida por
// extensión, no por file.type.
const MESH_MAX_SIZE = 30 * 1024 * 1024; // 30MB — el plan free de Cloudinary puede rechazar archivos grandes igual
const MESH_EXTENSIONS = [".glb", ".gltf", ".usdz"];

export async function POST(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const kind = formData?.get("kind") === "mesh" ? "mesh" : "image";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
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
      return NextResponse.json({ error: "Formato no soportado. Usá JPG, PNG, WEBP o AVIF." }, { status: 400 });
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
      folder: `agencies/${access.agencyId ?? "admin"}/properties`,
      resourceType: kind === "mesh" ? "raw" : "image",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/upload failed:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 503 });
  }
}
