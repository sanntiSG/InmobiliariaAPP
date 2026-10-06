import { cache } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFollow } from "@/lib/db/models/AgencyFollow";
import { Property } from "@/lib/db/models/Property";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { Navbar } from "@/components/layout/Navbar";
import { AgencyAvatar } from "@/components/property/AgencyAvatar";
import { AgencyPropertiesTabs } from "@/components/agency/AgencyPropertiesTabs";
import { FollowButton } from "@/components/agency/FollowButton";
import { buttonClasses } from "@/components/ui/Button";
import { buildWhatsappLink } from "@/config/site";
import { brand } from "@/config/brand";

/** Sólo inmobiliarias activas tienen perfil público (suspendidas o pendientes se comportan como inexistentes). */
const getAgency = cache(async (slug: string) => {
  await connectDB();
  return Agency.findOne({ slug, status: "active" }).lean();
});

export async function generateMetadata({ params }: PageProps<"/inmobiliarias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const agency = await getAgency(slug).catch(() => null);
  if (!agency) return { title: "Inmobiliaria no encontrada" };

  const description = agency.description?.slice(0, 160) || `Propiedades de ${agency.name} en ${brand.name}.`;
  const image = agency.cover || agency.logo;
  return {
    title: agency.name,
    description,
    openGraph: { title: agency.name, description, images: image ? [{ url: image }] : undefined },
  };
}

export default async function AgencyProfilePage({ params }: PageProps<"/inmobiliarias/[slug]">) {
  const { slug } = await params;
  const agency = await getAgency(slug).catch(() => null);
  if (!agency) notFound();

  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;

  const [docs, following] = await Promise.all([
    Property.find({ agencyId: agency._id, status: "published" })
      .select(PROPERTY_CARD_PROJECTION)
      .sort({ publishedAt: -1 })
      .limit(200)
      .lean(),
    userId ? AgencyFollow.exists({ userId, agencyId: agency._id }) : null,
  ]);
  const properties = docs.map((d) => toPropertyCardData(d));

  const agencyId = String(agency._id);
  const place = [agency.address?.city, agency.address?.province].filter(Boolean).join(", ");
  const whatsapp = agency.contact?.whatsapp;

  return (
    <div className="min-h-dvh">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <div className="relative h-40 overflow-hidden rounded-card bg-accent-soft sm:h-56">
          {agency.cover && (
            <Image src={agency.cover} alt="" fill priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
          )}
        </div>

        <header className="relative -mt-12 flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card sm:-mt-14 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <AgencyAvatar
                name={agency.name}
                logo={agency.logo}
                size={88}
                className="-mt-14 ring-4 ring-surface sm:-mt-16"
              />
              <div className="min-w-0 pt-1">
                <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">{agency.name}</h1>
                {place && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {place}
                  </p>
                )}
              </div>
            </div>

            <FollowButton
              agencyId={agencyId}
              agencySlug={agency.slug}
              isAuthenticated={!!userId}
              initialFollowing={!!following}
              initialFollowers={Math.max(0, agency.stats?.followers ?? 0)}
            />
          </div>

          {agency.description && <p className="max-w-3xl whitespace-pre-line text-text-muted">{agency.description}</p>}

          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a
                href={buildWhatsappLink(`Hola! Vi el perfil de ${agency.name} en ${brand.name}.`, whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("secondary", "sm")}
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            )}
            {agency.contact?.phone && (
              <a href={`tel:${agency.contact.phone}`} className={buttonClasses("secondary", "sm")}>
                <Phone className="h-4 w-4" aria-hidden /> Llamar
              </a>
            )}
            {agency.contact?.email && (
              <a href={`mailto:${agency.contact.email}`} className={buttonClasses("secondary", "sm")}>
                <Mail className="h-4 w-4" aria-hidden /> Email
              </a>
            )}
            {agency.contact?.website && (
              <a
                href={agency.contact.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={buttonClasses("secondary", "sm")}
              >
                <Globe className="h-4 w-4" aria-hidden /> Sitio web
              </a>
            )}
            {/* <a> y no <Link>: el mapa lee el filtro de la URL en una carga completa. */}
            {properties.length > 0 && (
              <a href={`/mapa?agency=${agencyId}`} className={buttonClasses("primary", "sm")}>
                <MapPin className="h-4 w-4" aria-hidden /> Ver en mapa
              </a>
            )}
          </div>
        </header>

        <section className="mt-8">
          <h2 className="mb-4 font-display text-xl font-bold text-text">
            Propiedades disponibles <span className="text-text-muted">({properties.length})</span>
          </h2>
          <AgencyPropertiesTabs properties={properties} />
        </section>
      </main>
    </div>
  );
}
