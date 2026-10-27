/**
 * El mail que se envía de verdad: el cuerpo de la respuesta más la firma corporativa de la inmobiliaria (si la tiene activada).
 * Junta los datos de la base (inmobiliaria y configuración) con las funciones puras de `signature.ts`.
 */
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { buildOutgoing, type Outgoing, type SignatureAgency } from "./signature";
import { loadSettings } from "./settings";
import { publicSiteUrl } from "./site";

/** Lo que la firma necesita de la inmobiliaria, tal como está guardado. */
export async function loadSignatureAgency(agencyId: string): Promise<SignatureAgency | null> {
  await connectDB();
  const a = await Agency.findById(agencyId).select("name slug logo branding contact address").lean();
  if (!a) return null;
  return {
    name: a.name,
    slug: a.slug,
    logo: a.logo ?? null,
    accentColor: a.branding?.accentColor ?? null,
    contact: {
      phone: a.contact?.phone ?? null,
      whatsapp: a.contact?.whatsapp ?? null,
      email: a.contact?.email ?? null,
      website: a.contact?.website ?? null,
      instagram: a.contact?.instagram ?? null,
      facebook: a.contact?.facebook ?? null,
      tiktok: a.contact?.tiktok ?? null,
    },
    address: { street: a.address?.street ?? null, city: a.address?.city ?? null, province: a.address?.province ?? null },
  };
}

/** El texto (y el HTML con firma, si corresponde) de una respuesta de esta inmobiliaria. Nunca lanza por la firma: sin ella, sale el texto. */
export async function composeOutgoing(agencyId: string, body: string): Promise<Outgoing> {
  try {
    const [agency, settings] = await Promise.all([loadSignatureAgency(agencyId), loadSettings(agencyId)]);
    if (!agency) return { text: body, html: null };
    return buildOutgoing(body, agency, publicSiteUrl(), { banner: settings.banner });
  } catch (err) {
    console.error("mail composeOutgoing failed:", (err as Error)?.message);
    return { text: body, html: null };
  }
}
