import { ImageResponse } from "next/og";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { loadFonts, resolveImage } from "@/lib/social/render";
import { brand } from "@/config/brand";

/**
 * La imagen que se ve al pegar el enlace de una inmobiliaria en WhatsApp, Telegram, redes o un mail: su portada con el nombre, el
 * lugar y cuántas propiedades tiene publicadas. Sólo se leen las fotos de nuestro storage (misma defensa que las publicaciones
 * para redes: `resolveImage` rechaza cualquier otra dirección) y se guarda una hora, así los chats no pegan a la base cada vez.
 */
export const alt = "Perfil de la inmobiliaria";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const SAND = "#d4c5a9";
const PAPER = "#f6f3ed";


export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let data: { name: string; place: string; count: number; cover: string | null; logo: string | null; initials: string } | null = null;
  try {
    await connectDB();
    const agency = await Agency.findOne({ slug, status: "active" }).select("name logo cover address").lean();
    if (agency) {
      const count = await Property.countDocuments({ agencyId: agency._id, status: "published" });
      const [cover, logo] = await Promise.all([
        agency.cover ? resolveImage(agency.cover, { w: 1200, h: 630, fill: true }) : null,
        agency.logo ? resolveImage(agency.logo, { w: 240, h: 240, fill: true }) : null,
      ]);
      data = {
        name: agency.name,
        place: [agency.address?.city, agency.address?.province].filter(Boolean).join(", "),
        count,
        cover,
        logo,
        initials: agency.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(""),
      };
    }
  } catch (err) {
    console.error("opengraph-image (inmobiliaria) failed:", (err as Error)?.message);
  }

  // Las mismas tipografías (Bricolage y Manrope) con las que se arman las publicaciones para redes.
  const fonts = await loadFonts();

  const title = data?.name ?? brand.name;
  const titleSize = title.length > 34 ? 56 : title.length > 22 ? 68 : 80;

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: "linear-gradient(135deg, #23262b 0%, #0e0f11 100%)", color: PAPER, fontFamily: "Manrope" }}>
        {data?.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (satori) sólo dibuja <img> comunes
          <img src={data.cover} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(180deg, rgba(14,15,17,0.30) 0%, rgba(14,15,17,0.94) 78%)" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "52px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, letterSpacing: 1, color: SAND }}>
            {brand.name}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {data && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 132, height: 132, borderRadius: 66, overflow: "hidden", background: "#1c1e22", border: "4px solid rgba(246,243,237,0.9)", marginRight: 32, fontSize: 52, fontWeight: 800, color: SAND, fontFamily: "Bricolage" }}>
                  {data.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (satori) sólo dibuja <img> comunes
                    <img src={data.logo} alt="" width={132} height={132} style={{ width: 132, height: 132, objectFit: "cover" }} />
                  ) : (
                    data.initials
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", maxWidth: data ? 900 : 1070 }}>
                <div style={{ display: "flex", fontFamily: "Bricolage", fontWeight: 800, fontSize: titleSize, lineHeight: 1.05, letterSpacing: -1.5 }}>{title}</div>
                {data?.place && <div style={{ display: "flex", marginTop: 10, fontSize: 32, fontWeight: 500, color: "rgba(246,243,237,0.82)" }}>{data.place}</div>}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", marginTop: 34 }}>
              {data ? (
                <div style={{ display: "flex", alignItems: "center", padding: "12px 26px", borderRadius: 999, background: SAND, color: "#0e0f11", fontSize: 28, fontWeight: 700 }}>
                  {data.count === 0 ? "Perfil en " : `${data.count} ${data.count === 1 ? "propiedad" : "propiedades"} en `}
                  {brand.name}
                </div>
              ) : (
                <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "rgba(246,243,237,0.82)" }}>{brand.description}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
