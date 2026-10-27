import { ImageResponse } from "next/og";
import { THEME_COLORS } from "@/config/theme";

/**
 * Ícono de la plataforma (192, 512 y 180 para iPhone) dibujado con la marca: fondo oscuro de la identidad y la flecha ascendente en
 * color arena. Con `?maskable=1` el dibujo queda dentro de la zona segura (Android recorta los íconos "maskable" en círculo,
 * cuadrado redondeado, etc.). Sin archivos binarios en el repositorio: se genera una vez y se guarda en caché.
 */
const SIZES = new Set([180, 192, 512]);
const SAND = "#d4c5a9";

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  if (!SIZES.has(n)) return new Response(null, { status: 404 });
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const glyph = Math.round(n * (maskable ? 0.4 : 0.56));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: THEME_COLORS.dark }}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke={SAND} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } }
  );
}
