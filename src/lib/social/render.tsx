import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPostData } from "./content";
import { POST_HEIGHT, POST_WIDTH, TEMPLATES, TEMPLATE_COUNT } from "./templates";

type FontDef = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" };

const FONT_DIR = path.join(process.cwd(), "src", "lib", "social", "fonts");
let fontsPromise: Promise<FontDef[]> | null = null;

/** Las tipografías de la marca (OFL, @fontsource) se leen una vez y quedan en memoria. */
function loadFonts(): Promise<FontDef[]> {
  fontsPromise ??= (async () => {
    const files: [string, string, FontDef["weight"]][] = [
      ["bricolage-grotesque-latin-800-normal.woff", "Bricolage", 800],
      ["manrope-latin-500-normal.woff", "Manrope", 500],
      ["manrope-latin-700-normal.woff", "Manrope", 700],
    ];
    return Promise.all(
      files.map(async ([file, name, weight]) => {
        const buf = await readFile(path.join(FONT_DIR, file));
        const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        return { name, data, weight, style: "normal" as const };
      })
    );
  })().catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Convierte una imagen de NUESTRO storage en data URI lista para el render.
 * Sólo Cloudinary / Unsplash (demo) por https o `/uploads/` local: cualquier otra URL se rechaza (SSRF).
 */
export async function resolveImage(
  url: string,
  opts: { w: number; h: number; fill: boolean }
): Promise<string | null> {
  try {
    let bytes: Buffer;
    let mime = "image/jpeg";
    if (url.startsWith("https://res.cloudinary.com/") && url.includes("/upload/")) {
      const t = opts.fill
        ? `c_fill,w_${opts.w},h_${opts.h},g_auto,f_jpg,q_85`
        : `c_limit,w_${opts.w},h_${opts.h},f_png`;
      mime = opts.fill ? "image/jpeg" : "image/png";
      const res = await fetch(url.replace("/upload/", `/upload/${t}/`), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) return null;
      bytes = Buffer.from(ab);
    } else if (url.startsWith("https://images.unsplash.com/")) {
      const u = new URL(url);
      u.searchParams.set("w", String(opts.w));
      u.searchParams.set("h", String(opts.h));
      u.searchParams.set("fit", "crop");
      u.searchParams.set("fm", "jpg");
      const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) return null;
      bytes = Buffer.from(ab);
    } else if (url.startsWith("/uploads/")) {
      const name = path.basename(url);
      if (name !== url.slice("/uploads/".length) || name.startsWith(".")) return null;
      const ext = path.extname(name).toLowerCase();
      const known: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
      if (!known[ext]) return null;
      mime = known[ext];
      bytes = await readFile(path.join(process.cwd(), "public", "uploads", name));
    } else {
      return null;
    }
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export type RenderInput = {
  property: Parameters<typeof buildPostData>[0];
  agency: Parameters<typeof buildPostData>[1];
  photoUrl: string;
  templateId: number;
};

/** Dibuja la publicación (PNG 1080×1350). Devuelve `null` si la foto no se puede leer. */
export async function renderPost(input: RenderInput): Promise<ImageResponse | null> {
  const photo = await resolveImage(input.photoUrl, { w: POST_WIDTH, h: POST_HEIGHT, fill: true });
  if (!photo) return null;
  const logo = input.agency.logo
    ? await resolveImage(input.agency.logo, { w: 120, h: 120, fill: false })
    : null;
  const data = buildPostData(input.property, input.agency, photo, logo);
  const template = TEMPLATES[((input.templateId % TEMPLATE_COUNT) + TEMPLATE_COUNT) % TEMPLATE_COUNT];
  return new ImageResponse(template(data), {
    width: POST_WIDTH,
    height: POST_HEIGHT,
    fonts: await loadFonts(),
  });
}
