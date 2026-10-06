"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { notificationMeta } from "./notification-meta";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: string;
};

/** Lista completa de notificaciones (página /notificaciones): leer al abrir y "marcar todas". */
export function NotificationsList({ initialItems }: { initialItems: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    router.refresh();
  }

  function open(n: NotificationRow) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
    }
    if (n.href) router.push(n.href);
  }

  if (items.length === 0) {
    return <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">No hay notificaciones para mostrar.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Marcar todas como leídas ({unread})
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const meta = notificationMeta(n.type);
          const Icon = meta.icon;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-card p-4 text-left shadow-card transition-[transform,background-color] duration-150",
                  "[transition-timing-function:var(--ease-out)] hover:bg-surface-2 active:scale-[0.995]",
                  n.read ? "bg-surface" : "bg-accent-soft"
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-text-muted">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{meta.label}</span>
                  <span className="flex items-center gap-2">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                    <span className="text-[15px] font-semibold text-text">{n.title}</span>
                  </span>
                  {n.body && <span className="text-sm text-text-muted">{n.body}</span>}
                  <span className="text-xs text-text-muted">{formatRelativeTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
