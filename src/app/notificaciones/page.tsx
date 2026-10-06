import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Notification } from "@/lib/db/models/Notification";
import { Navbar } from "@/components/layout/Navbar";
import { NotificationsList, type NotificationRow } from "@/components/notifications/NotificationsList";
import {
  NOTIFICATION_GROUP_LABELS,
  NOTIFICATION_META,
  type NotificationGroup,
} from "@/components/notifications/notification-meta";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Notificaciones" };

const GROUPS = Object.keys(NOTIFICATION_GROUP_LABELS) as NotificationGroup[];

export default async function NotificacionesPage({ searchParams }: PageProps<"/notificaciones">) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect("/ingresar?callbackUrl=%2Fnotificaciones");

  const raw = (await searchParams).grupo;
  const filter = Array.isArray(raw) ? raw[0] : raw;
  const group = GROUPS.find((g) => g === filter);
  const onlyUnread = filter === "sin-leer";

  const query: Record<string, unknown> = { userId: session.user.id };
  if (group) {
    query.type = { $in: Object.entries(NOTIFICATION_META).filter(([, m]) => m.group === group).map(([t]) => t) };
  }
  if (onlyUnread) query.read = false;

  await connectDB();
  const docs = await Notification.find(query).sort({ createdAt: -1 }).limit(60).lean();

  const items: NotificationRow[] = docs.map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? undefined,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  const chips: { key: string | null; label: string }[] = [
    { key: null, label: "Todas" },
    { key: "sin-leer", label: "Sin leer" },
    ...GROUPS.map((g) => ({ key: g, label: NOTIFICATION_GROUP_LABELS[g] })),
  ];

  return (
    <div className="min-h-dvh">
      <Navbar />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-text">Notificaciones</h1>

        <nav aria-label="Filtrar notificaciones" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chips.map((chip) => {
            const active = (filter ?? null) === chip.key && (chip.key !== null || !filter);
            return (
              <Link
                key={chip.label}
                href={chip.key ? `/notificaciones?grupo=${chip.key}` : "/notificaciones"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted hover:text-text"
                )}
              >
                {chip.label}
              </Link>
            );
          })}
        </nav>

        <NotificationsList key={filter ?? "todas"} initialItems={items} />
      </main>
    </div>
  );
}
