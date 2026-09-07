"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function fetchNotifications() {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items);
    setUnreadCount(data.unreadCount);
  }

  useEffect(() => {
    if (!session?.user) return;
    // Sincroniza con la API externa al montar/cambiar de usuario — no es
    // estado derivado de props, dispara el fetch real y su polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    await fetchNotifications();
    setLoading(false);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  async function handleClick(n: NotificationItem) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      });
    }
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  if (!session?.user) return null;

  return (
    <>
      <IconButton variant="ghost" aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`} onClick={openPanel} className="relative">
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </IconButton>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notificaciones" side="right">
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="mb-4 text-sm font-medium text-accent hover:underline">
            Marcar todas como leídas
          </button>
        )}

        {loading && items.length === 0 ? (
          <p className="text-sm text-text-muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted">No tenés notificaciones todavía.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-media px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                  !n.read && "bg-accent-soft"
                )}
              >
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                  <p className="text-sm font-semibold text-text">{n.title}</p>
                </div>
                {n.body && <p className="text-sm text-text-muted">{n.body}</p>}
                <p className="text-xs text-text-muted">{formatRelativeTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
