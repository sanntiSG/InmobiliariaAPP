"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { buildWhatsappLink } from "@/config/site";
import { formatRelativeTime } from "@/lib/utils/format";

export type AgencyRequestRow = {
  id: string;
  name: string;
  email: string;
  agencyName: string;
  phone: string;
  zone: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
};

const STATUS_LABEL = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" } as const;

/** Número para wa.me: sólo dígitos. */
const digitsOnly = (phone: string) => phone.replace(/\D/g, "");

export function AgencyRequestsManager({ requests }: { requests: AgencyRequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, action: "approve" | "reject") {
    let note = "";
    if (action === "reject") {
      const answer = window.prompt("Motivo del rechazo (opcional, lo ve la persona):", "");
      if (answer === null) return;
      note = answer;
    } else if (!window.confirm("¿Aprobar la solicitud? La persona podrá crear y gestionar su inmobiliaria.")) {
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agency-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo resolver la solicitud.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver la solicitud.");
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) {
    return (
      <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">
        Todavía no hay solicitudes. Cuando alguien pida gestionar una inmobiliaria, va a aparecer acá.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-card bg-danger-soft p-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {requests.map((r) => {
        const pending = r.status === "pending";
        const waNumber = digitsOnly(r.phone);
        return (
          <article key={r.id} className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-text">{r.agencyName}</h2>
                <p className="text-sm text-text-muted">
                  {r.name} · {r.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={pending ? "soft" : r.status === "approved" ? "success" : "neutral"}>
                  {STATUS_LABEL[r.status]}
                </Badge>
                <span className="text-xs text-text-muted">{formatRelativeTime(r.createdAt)}</span>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-text-muted">Teléfono:</dt>
                <dd className="text-text">{r.phone}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-muted">Zona:</dt>
                <dd className="text-text">{r.zone}</dd>
              </div>
            </dl>
            {r.message && <p className="whitespace-pre-line text-sm text-text-muted">“{r.message}”</p>}
            {!pending && r.reviewNote && <p className="text-sm text-text-muted">Nota: {r.reviewNote}</p>}

            {pending && (
              <div className="flex flex-wrap gap-2 pt-1">
                {waNumber.length >= 8 && (
                  <a
                    href={buildWhatsappLink(
                      `Hola ${r.name}! Te escribimos por tu solicitud para gestionar "${r.agencyName}".`,
                      waNumber
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses("secondary", "sm")}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden /> Escribir por WhatsApp
                  </a>
                )}
                <Button size="sm" disabled={busyId === r.id} onClick={() => review(r.id, "approve")}>
                  <Check className="h-4 w-4" aria-hidden /> Aprobar
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => review(r.id, "reject")}>
                  <X className="h-4 w-4" aria-hidden /> Rechazar
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
