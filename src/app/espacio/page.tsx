import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bell, Building2, Eye, Heart, MessageSquare, Bookmark, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Model } from "mongoose";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { AgencyFollow } from "@/lib/db/models/AgencyFollow";
import { Comment } from "@/lib/db/models/Comment";
import { Favorite } from "@/lib/db/models/Favorite";
import { Interaction } from "@/lib/db/models/Interaction";
import { Like } from "@/lib/db/models/Like";
import { Notification } from "@/lib/db/models/Notification";
import { Property } from "@/lib/db/models/Property";
import { User } from "@/lib/db/models/User";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { getFreshAccount } from "@/lib/auth/fresh-account";
import { resolvePanelLink } from "@/lib/auth/panel-link";
import { getRecommendedProperties } from "@/lib/recommendations/engine";
import { Navbar } from "@/components/layout/Navbar";
import { PropertyGrid } from "@/components/property/PropertyGrid";
import { AgencyAvatar } from "@/components/property/AgencyAvatar";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { notificationMeta } from "@/components/notifications/notification-meta";
import type { PropertyCardData } from "@/components/property/types";
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS, type Operation, type PropertyType } from "@/config/filters";
import { formatPrice, formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Mi espacio" };

const nf = new Intl.NumberFormat("es-AR");

/**
 * "Mi espacio": el panel de quien explora con cuenta — lo que guardó, lo que le
 * gustó, sus comentarios, las inmobiliarias que sigue, sus notificaciones y las
 * recomendaciones (por lógica tradicional, sin IA). Es sólo para esa persona:
 * las inmobiliarias y el admin tienen su propio panel y van para allá.
 */
export default async function EspacioPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect("/ingresar?callbackUrl=%2Fespacio");
  const userId = session.user.id;

  // Rol de la base (no de la cookie): quien ya tiene su panel va directo ahí.
  const account = await getFreshAccount(userId);
  if (!account) redirect("/ingresar");
  if (account.role !== "user") redirect(resolvePanelLink(account)?.href ?? "/");

  await connectDB();

  const cardsOf = async (model: Model<{ propertyId: unknown }>, limit: number): Promise<PropertyCardData[]> => {
    const docs = await model
      .find({ userId })
      .populate({ path: "propertyId", select: PROPERTY_CARD_PROJECTION, populate: { path: "agencyId", select: "name" } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return docs.filter((d: any) => d.propertyId).map((d: any) => toPropertyCardData(d.propertyId));
  };

  const [
    userDoc,
    favoriteCount,
    likeCount,
    commentCount,
    followCount,
    unreadCount,
    saved,
    liked,
    recommended,
    commentDocs,
    follows,
    notifications,
    viewDocs,
  ] = await Promise.all([
    User.findById(userId).select("name email preferences").lean(),
    Favorite.countDocuments({ userId }),
    Like.countDocuments({ userId }),
    Comment.countDocuments({ userId, deletedAt: null }),
    AgencyFollow.countDocuments({ userId }),
    Notification.countDocuments({ userId, read: false }),
    cardsOf(Favorite as unknown as Model<{ propertyId: unknown }>, 6),
    cardsOf(Like as unknown as Model<{ propertyId: unknown }>, 6),
    getRecommendedProperties(userId, 4).catch(() => [] as PropertyCardData[]),
    Comment.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).limit(5).select("propertyId body createdAt").lean(),
    AgencyFollow.find({ userId }).sort({ createdAt: -1 }).limit(8).populate({ path: "agencyId", select: "name slug logo" }).lean(),
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    Interaction.find({ userId, type: "view" }).sort({ createdAt: -1 }).limit(40).select("propertyId").lean(),
  ]);

  // — Vistas recientemente: sin repetir, en orden, sólo propiedades publicadas —
  const viewIds = [...new Set(viewDocs.map((v) => String(v.propertyId)))].slice(0, 6);
  const viewedMap = new Map<string, PropertyCardData>();
  if (viewIds.length > 0) {
    const props = await Property.find({ _id: { $in: viewIds }, status: "published" })
      .select(PROPERTY_CARD_PROJECTION)
      .populate({ path: "agencyId", select: "name" })
      .lean();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of props as any[]) viewedMap.set(String(p._id), toPropertyCardData(p));
  }
  const viewed = viewIds.map((id) => viewedMap.get(id)).filter((p): p is PropertyCardData => !!p);

  // — Comentarios con el nombre de la propiedad a la que van —
  const commentProps = await Property.find({ _id: { $in: commentDocs.map((c) => c.propertyId) } })
    .select("title slug")
    .lean();
  const propById = new Map(commentProps.map((p) => [String(p._id), p]));

  const name = userDoc?.name ?? session.user.name ?? "Vos";
  const email = userDoc?.email ?? session.user.email ?? "";
  const prefs = userDoc?.preferences;
  const prefChips = [
    ...(prefs?.operations ?? []).map((o: string) => OPERATION_LABELS[o as Operation] ?? o),
    ...(prefs?.propertyTypes ?? []).map((t: string) => PROPERTY_TYPE_LABELS[t as PropertyType] ?? t),
    ...(prefs?.locations ?? []),
    prefs?.priceMin != null && prefs?.priceMax != null
      ? `${formatPrice(prefs.priceMin)} a ${formatPrice(prefs.priceMax)}`
      : prefs?.priceMax != null
        ? `Hasta ${formatPrice(prefs.priceMax)}`
        : prefs?.priceMin != null
          ? `Desde ${formatPrice(prefs.priceMin)}`
          : null,
    prefs?.minRooms ? `${prefs.minRooms}+ ambientes` : null,
  ].filter((c): c is string => !!c);

  const stats: { label: string; value: number; icon: LucideIcon; href: string }[] = [
    { label: "Guardadas", value: favoriteCount, icon: Bookmark, href: "#guardadas" },
    { label: "Me gusta", value: likeCount, icon: Heart, href: "#me-gusta" },
    { label: "Comentarios", value: commentCount, icon: MessageSquare, href: "#comentarios" },
    { label: "Siguiendo", value: followCount, icon: Building2, href: "#siguiendo" },
    { label: "Sin leer", value: unreadCount, icon: Bell, href: "#novedades" },
  ];

  return (
    <div className="min-h-dvh">
      <Navbar />
      <DashboardReveal className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        {/* Cabecera */}
        <header data-reveal="" className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-accent-soft font-display text-xl font-bold text-accent">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-text-muted">Mi espacio</p>
              <h1 className="truncate font-display text-2xl font-bold text-text">Hola, {name.split(" ")[0]}</h1>
              <p className="truncate text-sm text-text-muted">{email}</p>
            </div>
          </div>
          <Link
            href="/perfil"
            className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Editar mis preferencias
          </Link>
        </header>

        {/* Indicadores */}
        <section data-reveal="" aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(({ label, value, icon: Icon, href }, i) => (
            <a
              key={label}
              href={href}
              className={cn(
                i === stats.length - 1 && "col-span-2 sm:col-span-1",
                "group flex flex-col gap-2 rounded-card bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 active:scale-[0.98]"
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="font-display text-2xl font-semibold text-text">{nf.format(value)}</span>
              <span className="text-sm text-text-muted">{label}</span>
            </a>
          ))}
        </section>

        {/* Recomendado */}
        <Section
          id="recomendado"
          title="Recomendado para vos"
          action={{ href: "/recomendaciones", label: "Ver todas" }}
          hint="Según tus preferencias y tu actividad, sin IA."
        >
          {recommended.length === 0 ? (
            <Empty
              text="Todavía no tenemos con qué recomendarte. Explorá propiedades o contanos qué buscás y empezamos."
              cta={{ href: "/mapa", label: "Explorar el mapa" }}
            />
          ) : (
            <PropertyGrid properties={recommended} />
          )}
        </Section>

        <Section id="guardadas" title="Guardadas" count={favoriteCount}>
          {saved.length === 0 ? (
            <Empty text="Todavía no guardaste ninguna propiedad. Tocá el corazón desde el mapa o el listado." cta={{ href: "/mapa", label: "Buscar propiedades" }} />
          ) : (
            <PropertyGrid properties={saved} />
          )}
        </Section>

        <Section id="me-gusta" title="Me gusta" count={likeCount}>
          {liked.length === 0 ? (
            <Empty text="Cuando des me gusta a una propiedad la vas a encontrar acá." />
          ) : (
            <PropertyGrid properties={liked} />
          )}
        </Section>

        {viewed.length > 0 && (
          <Section id="vistas" title="Vistas recientemente" icon={Eye}>
            <PropertyGrid properties={viewed} />
          </Section>
        )}

        <div className="grid gap-10 lg:grid-cols-2">
          <Section id="comentarios" title="Mis comentarios" count={commentCount}>
            {commentDocs.length === 0 ? (
              <Empty text="Todavía no comentaste ninguna propiedad." />
            ) : (
              <ul className="flex flex-col gap-2">
                {commentDocs.map((c) => {
                  const prop = propById.get(String(c.propertyId));
                  return (
                    <li key={String(c._id)} className="rounded-card bg-surface p-4 shadow-card">
                      <p className="line-clamp-3 text-sm text-text">{c.body}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                        {prop ? (
                          <Link href={`/propiedades/${prop.slug}`} className="font-medium text-accent hover:underline">
                            {prop.title}
                          </Link>
                        ) : (
                          <span>Propiedad ya no disponible</span>
                        )}
                        <span>· {formatRelativeTime(c.createdAt)}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="novedades" title="Novedades" action={{ href: "/notificaciones", label: "Ver todas" }}>
            {notifications.length === 0 ? (
              <Empty text="No tenés notificaciones todavía." />
            ) : (
              <ul className="flex flex-col gap-1">
                {notifications.map((n) => {
                  const Icon = notificationMeta(n.type).icon;
                  const row = (
                    <>
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />}
                          <span className="truncate text-sm font-semibold text-text">{n.title}</span>
                        </span>
                        {n.body && <span className="line-clamp-2 text-sm text-text-muted">{n.body}</span>}
                        <span className="text-xs text-text-muted">{formatRelativeTime(n.createdAt)}</span>
                      </span>
                    </>
                  );
                  const cls = cn(
                    "flex items-start gap-3 rounded-media px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                    !n.read && "bg-accent-soft"
                  );
                  return (
                    <li key={String(n._id)}>
                      {n.href ? (
                        <Link href={n.href} className={cls}>
                          {row}
                        </Link>
                      ) : (
                        <div className={cls}>{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <Section id="siguiendo" title="Inmobiliarias que seguís" count={followCount}>
            {follows.length === 0 ? (
              <Empty text="Seguí a una inmobiliaria desde su perfil para enterarte de sus novedades." />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {follows.map((f) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const a = f.agencyId as any;
                  if (!a?.slug) return null;
                  return (
                    <li key={String(f._id)}>
                      <Link
                        href={`/inmobiliarias/${a.slug}`}
                        className="inline-flex items-center gap-2 rounded-pill bg-surface py-1.5 pl-1.5 pr-4 text-sm font-medium text-text shadow-card transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 active:scale-[0.97]"
                      >
                        <AgencyAvatar name={a.name} logo={a.logo} size={28} />
                        {a.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="preferencias" title="Mis preferencias" action={{ href: "/perfil", label: "Editar" }}>
            {prefChips.length === 0 ? (
              <Empty text="Contanos qué buscás (zona, precio, tipo) y mejoramos tus recomendaciones." cta={{ href: "/perfil", label: "Cargar preferencias" }} />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {prefChips.map((chip) => (
                  <li key={chip} className="rounded-pill bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
                    {chip}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </DashboardReveal>
    </div>
  );
}

function Section({
  id,
  title,
  count,
  hint,
  action,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  hint?: string;
  action?: { href: string; label: string };
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-reveal="" className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text">
            {Icon && <Icon className="h-4 w-4 text-text-muted" aria-hidden />}
            {title}
            {count != null && count > 0 && <span className="text-text-muted">({nf.format(count)})</span>}
          </h2>
          {hint && <p className="text-sm text-text-muted">{hint}</p>}
        </div>
        {action && (
          <Link href={action.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline">
            {action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border p-5 text-sm text-text-muted">
      <p>{text}</p>
      {cta && (
        <Link href={cta.href} className="font-medium text-accent hover:underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
