import { cache, type CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Star, Waves } from "lucide-react";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Like } from "@/lib/db/models/Like";
import { Favorite } from "@/lib/db/models/Favorite";
import { Rating } from "@/lib/db/models/Rating";
import { AvailabilityWatch } from "@/lib/db/models/AvailabilityWatch";
import { Comment } from "@/lib/db/models/Comment";
import { toPropertyDetail } from "@/lib/db/property-detail-mapper";
import { auth } from "@/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { PriceTag } from "@/components/property/PriceTag";
import { RentalAvailability } from "@/components/property/RentalAvailability";
import { PropertyMedia } from "@/components/property/PropertyMedia";
import { PropertyFeaturesGrid } from "@/components/property/PropertyFeaturesGrid";
import { AmenitiesList } from "@/components/property/AmenitiesList";
import { AgencyContactCard } from "@/components/property/AgencyContactCard";
import { SocialBar } from "@/components/property/SocialBar";
import { ShareButton } from "@/components/property/ShareButton";
import { InquiryForm } from "@/components/property/InquiryForm";
import { AgencyAvatar } from "@/components/property/AgencyAvatar";
import { PropertyVideos } from "@/components/property/PropertyVideos";
import { PropertyTracker } from "@/components/property/PropertyTracker";
import { AskAboutProperty } from "@/components/advisor/AskAboutProperty";
import { getPublishedConfig, toPublicConfig } from "@/lib/advisor/config";
import { CommentsSection, type CommentItem } from "@/components/property/CommentsSection";
import { PropertyLocationMapLazy } from "@/components/map/PropertyLocationMapLazy";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  type Operation,
  type PropertyType,
  type PropertyStatus,
} from "@/config/filters";
import { formatCompactNumber, formatRelativeTime } from "@/lib/utils/format";
import { brand } from "@/config/brand";
import { beachDistanceLabel } from "@/config/pricing";
import { getSiteOrigin } from "@/lib/site-url";

/**
 * Sin filtro de `status` acá a propósito: el dueño (o el admin) puede
 * previsualizar una propiedad no publicada — el chequeo de quién puede
 * verla vive en el componente de página, donde ya hay sesión disponible.
 */
const getProperty = cache(async (slug: string) => {
  await connectDB();
  const doc = await Property.findOne({ slug }).populate("agencyId").lean();
  return doc ? toPropertyDetail(doc) : null;
});

export async function generateMetadata({ params }: PageProps<"/propiedades/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug).catch(() => null);
  if (!property) return { title: "Propiedad no encontrada" };

  const description = property.description.slice(0, 160) || `${property.title} en ${brand.name}`;
  return {
    title: property.title,
    description,
    ...(property.status !== "published" ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: property.title,
      description,
      // Con portada viva, la imagen para compartir es su póster (la foto de portada que ve la gente).
      images: property.ambient
        ? [{ url: property.ambient.poster.url }]
        : property.images[0]
          ? [{ url: property.images[0].url }]
          : undefined,
    },
  };
}

export default async function PropertyDetailPage({ params }: PageProps<"/propiedades/[slug]">) {
  const { slug } = await params;
  const property = await getProperty(slug).catch(() => null);
  if (!property) notFound();

  // auth() lee cookies — debe resolverse en el render, `after()` no puede
  // acceder a Request APIs (ver docs de Next.js).
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;

  const isPublished = property.status === "published";
  const canPreview =
    session?.user?.role === "admin" ||
    (!!property.agency && !!session?.user?.agencyId && session.user.agencyId === property.agency.id);
  // No publicada y quien mira no es su dueño/admin: se comporta exactamente
  // como si no existiera (mismo 404 que antes para cualquier visitante).
  if (!isPublished && !canPreview) notFound();

  // Sólo cuenta como interés real si está publicada y quien mira no es su
  // dueño/admin: ni un borrador ni la propia inmobiliaria inflan sus stats.
  // La vista y la permanencia las registra el cliente (PropertyTracker →
  // /api/track), que además deduplica y descarta bots.
  const trackingEnabled = isPublished && !canPreview;

  const [likeDoc, favoriteDoc, ratingDoc, commentDocs, commentsTotal, watchDoc] = await connectDB().then(() =>
    Promise.all([
      userId ? Like.exists({ userId, propertyId: property.id }) : null,
      userId ? Favorite.exists({ userId, propertyId: property.id }) : null,
      userId ? Rating.findOne({ userId, propertyId: property.id }).select("value").lean() : null,
      Comment.find({ propertyId: property.id, deletedAt: null })
        .populate({ path: "userId", select: "name" })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Comment.countDocuments({ propertyId: property.id, deletedAt: null }),
      userId && property.availability ? AvailabilityWatch.exists({ userId, propertyId: property.id }) : null,
    ])
  );

  const initialComments: CommentItem[] = commentDocs.map((c) => {
    const commentUser = c.userId as unknown as { _id?: unknown; name?: string } | null | undefined;
    return {
      id: String(c._id),
      body: c.body,
      createdAt: c.createdAt?.toISOString?.() ?? new Date().toISOString(),
      user: {
        id: commentUser?._id ? String(commentUser._id) : "",
        name: commentUser?.name ?? "Usuario",
      },
    };
  });

  const siteOrigin = await getSiteOrigin();
  // Nombre, póster y si el asesor está encendido para exploradores: se resuelven acá para que el botón no "salte" al hidratar.
  const advisor = toPublicConfig(await getPublishedConfig());

  const addressLine = [property.address.neighborhood, property.address.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-dvh pt-[calc(var(--header-h)+var(--safe-top))] pb-[var(--safe-bottom)]">
      <Navbar variant="immersive" />

      <div className="mx-auto max-w-6xl py-6 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] sm:pl-[max(1.5rem,var(--safe-left))] sm:pr-[max(1.5rem,var(--safe-right))]">
        {!isPublished && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-warning-soft px-4 py-3 text-sm text-text">
            <span>
              <strong className="font-semibold">Vista previa</strong> — esta propiedad todavía no
              está publicada ({PROPERTY_STATUS_LABELS[property.status as PropertyStatus] ?? property.status}).
              Sólo vos podés verla así.
            </span>
            <Link
              href={`/dashboard/propiedades/${property.id}/editar`}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline"
            >
              Editar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
        <Link
          href="/propiedades"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Volver al listado
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="flex flex-col gap-8 lg:col-span-2">
            <PropertyTracker propertyId={property.id} enabled={trackingEnabled} />
            <PropertyMedia propertyId={property.id} trackingEnabled={trackingEnabled} images={property.images} tours={property.tours} virtualTour={property.virtualTour} ambient={property.ambient} title={property.title} />

            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="hero-eyebrow rise">
                    <span className="hero-eyebrow-dot" aria-hidden="true" />
                    {OPERATION_LABELS[property.operation as Operation] ?? property.operation} ·{" "}
                    {PROPERTY_TYPE_LABELS[property.type as PropertyType] ?? property.type}
                  </p>
                  <h1 className="page-title rise" style={{ "--rise-i": 1 } as CSSProperties}>
                    {property.title}
                  </h1>
                  {addressLine && <p className="mt-2 text-text-muted">{addressLine}</p>}
                  {property.features.beachDistance != null && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-muted">
                      <Waves className="h-4 w-4 shrink-0" aria-hidden /> {beachDistanceLabel(property.features.beachDistance)}
                    </p>
                  )}
                  {property.agency && (
                    <Link
                      href={`/inmobiliarias/${property.agency.slug}`}
                      className="group mt-3 inline-flex items-center gap-2 text-sm text-text-muted"
                    >
                      <AgencyAvatar name={property.agency.name} logo={property.agency.logo} size={28} />
                      <span>
                        Publicado por{" "}
                        <span className="font-medium text-text group-hover:text-accent">{property.agency.name}</span>
                      </span>
                    </Link>
                  )}
                </div>
                <PriceTag
                  amount={property.price.amount}
                  currency={property.price.currency}
                  period={property.price.period}
                  className="text-2xl sm:text-3xl"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
                <span>
                  <span className="font-mono">{formatCompactNumber(property.stats.views)}</span> visualizaciones
                </span>
                {property.stats.ratingCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-warning" fill="currentColor" aria-hidden />
                    {property.stats.ratingAvg.toFixed(1)} ({property.stats.ratingCount})
                  </span>
                )}
                {property.publishedAt && <span>Publicado {formatRelativeTime(property.publishedAt)}</span>}
              </div>

              {isPublished && advisor.enabled.explorer && (
                <div className="mt-4">
                  <AskAboutProperty propertyId={property.id} title={property.title} ctaTo={advisor.ctaTo} poster={advisor.poster} />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SocialBar
                  propertyId={property.id}
                  isAuthenticated={!!userId}
                  initialLiked={!!likeDoc}
                  initialFavorited={!!favoriteDoc}
                  initialLikes={property.stats.likes}
                  initialSaves={property.stats.saves}
                  initialRatingAvg={property.stats.ratingAvg}
                  initialRatingCount={property.stats.ratingCount}
                  initialMyRating={ratingDoc?.value ?? null}
                />
                {isPublished && <ShareButton propertyId={property.id} title={property.title} />}
              </div>
            </div>

            <Reveal>
              <PropertyFeaturesGrid features={property.features} />
            </Reveal>

            {property.description && (
              <Reveal as="section">
                <h2 className="font-display text-lg font-semibold text-text">Descripción</h2>
                <p className="mt-2 whitespace-pre-line text-text-muted">{property.description}</p>
              </Reveal>
            )}

            {property.amenities.length > 0 && (
              <Reveal as="section">
                <h2 className="font-display text-lg font-semibold text-text">Comodidades</h2>
                <div className="mt-2">
                  <AmenitiesList amenities={property.amenities} />
                </div>
              </Reveal>
            )}

            {/* Videos: información extra, a propósito más abajo que las fotos y el recorrido 360°. */}
            <Reveal>
              <PropertyVideos videos={property.videos} />
            </Reveal>

            <Reveal as="section">
              <h2 className="font-display text-lg font-semibold text-text">Ubicación</h2>
              <p className="mt-1 text-sm text-text-muted">
                {property.address.showExact
                  ? [property.address.street, property.address.number].filter(Boolean).join(" ") || addressLine
                  : `Zona aproximada — ${addressLine}`}
              </p>
              <div className="mt-3 h-72 overflow-hidden rounded-card">
                <PropertyLocationMapLazy
                  lng={property.lng}
                  lat={property.lat}
                  property={{
                    id: property.id,
                    title: property.title,
                    price: property.price.amount,
                    currency: property.price.currency,
                    tour3d: property.tours.length > 0,
                  }}
                />
              </div>
            </Reveal>

            <Reveal>
              <CommentsSection propertyId={property.id} initialComments={initialComments} initialTotal={commentsTotal} />
            </Reveal>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <Reveal>
              <Card className="p-5">
                <PriceTag
                  amount={property.price.amount}
                  currency={property.price.currency}
                  period={property.price.period}
                  className="text-2xl"
                />
                {property.price.expenses > 0 && (
                  <p className="mt-1 text-sm text-text-muted">
                    + expensas {property.price.currency === "USD" ? "US$" : "$"}
                    {new Intl.NumberFormat("es-AR").format(property.price.expenses)}
                  </p>
                )}
                {property.availability && (
                  <div className="mt-4 border-t border-border pt-4">
                    <RentalAvailability
                      status={property.availability.status}
                      busy={property.availability.busy}
                      propertyId={property.id}
                      isAuthenticated={!!userId}
                      initialWatching={!!watchDoc}
                      returnTo={`/propiedades/${property.slug}`}
                      canWatch={isPublished}
                    />
                  </div>
                )}
              </Card>
            </Reveal>
            {property.agency && (
              <Reveal>
                <AgencyContactCard
                  agency={property.agency}
                  propertyId={property.id}
                  propertyTitle={property.title}
                  propertyUrl={`${siteOrigin}/propiedades/${property.slug}`}
                />
              </Reveal>
            )}
            {isPublished && property.agency && (
              <Reveal>
                <InquiryForm
                  propertyId={property.id}
                  propertyTitle={property.title}
                  defaultName={session?.user?.name ?? ""}
                  defaultEmail={session?.user?.email ?? ""}
                />
              </Reveal>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
