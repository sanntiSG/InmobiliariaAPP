"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, Clock, Handshake, Mail, MessageCircle, Phone, TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { buildWhatsappLink } from "@/config/site";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import type { LeadRow } from "@/lib/leads/serialize";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Filter = "todos" | "sin-seguimiento" | LeadStatus;

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/**
 * Tablero de clientes potenciales: columnas por etapa en desktop, lista con
 * chips de filtro en mobile. Un clic abre el detalle (cambiar etapa, anotar,
 * registrar contacto). Los que llevan mucho tiempo sin seguimiento se marcan.
 */
export function LeadsBoard({ initialLeads }: { initialLeads: LeadRow[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [filter, setFilter] = useState<Filter>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const staleCount = leads.filter((l) => l.stale).length;

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const l of leads) byStatus[l.status] += 1;
    return byStatus;
  }, [leads]);

  const visible = leads.filter((l) => (filter === "todos" ? true : filter === "sin-seguimiento" ? l.stale : l.status === filter));

  async function update(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar.");
      setLeads((prev) => prev.map((l) => (l.id === id ? (data.item as LeadRow) : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-card bg-surface p-10 text-center shadow-card">
        <p className="font-medium text-text">Todavía no recibiste consultas.</p>
        <p className="mt-1 text-sm text-text-muted">
          Cuando alguien consulte por una de tus propiedades desde su ficha, va a aparecer acá con su contacto.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {staleCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter("sin-seguimiento")}
          className="flex items-center gap-2 rounded-card bg-warning-soft px-4 py-3 text-left text-sm text-text"
        >
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            <strong className="font-semibold">{staleCount}</strong> {staleCount === 1 ? "cliente lleva" : "clientes llevan"}{" "}
            demasiado tiempo sin seguimiento.
          </span>
        </button>
      )}

      {error && (
        <p className="rounded-card bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Desktop: una columna por etapa. */}
      <div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">
        {LEAD_STATUSES.map((status) => (
          <section key={status} className="flex w-64 shrink-0 flex-col gap-2">
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-text">
              {LEAD_STATUS_LABELS[status]}
              <span className="text-xs font-medium text-text-muted">{counts[status]}</span>
            </h2>
            <div className="flex min-h-24 flex-col gap-2 rounded-card bg-surface-2 p-2">
              {leads
                .filter((l) => l.status === status)
                .map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={() => setSelectedId(l.id)} />
                ))}
            </div>
          </section>
        ))}
      </div>

      {/* Mobile / tablet: chips + lista. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip active={filter === "todos"} onClick={() => setFilter("todos")}>
            Todos ({leads.length})
          </FilterChip>
          {staleCount > 0 && (
            <FilterChip active={filter === "sin-seguimiento"} onClick={() => setFilter("sin-seguimiento")}>
              Sin seguimiento ({staleCount})
            </FilterChip>
          )}
          {LEAD_STATUSES.map((s) => (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {LEAD_STATUS_LABELS[s]} ({counts[s]})
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {visible.length === 0 ? (
            <p className="rounded-card bg-surface p-5 text-sm text-text-muted shadow-card">No hay clientes en esta vista.</p>
          ) : (
            visible.map((l) => <LeadCard key={l.id} lead={l} showStatus onOpen={() => setSelectedId(l.id)} />)
          )}
        </div>
      </div>

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name ?? "Cliente"} side="right">
        {selected && <LeadDetail lead={selected} onUpdate={(body) => update(selected.id, body)} />}
      </Sheet>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill px-3.5 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

function LeadCard({ lead, onOpen, showStatus = false }: { lead: LeadRow; onOpen: () => void; showStatus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1.5 rounded-media bg-surface p-3 text-left shadow-pop transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:shadow-card active:scale-[0.99]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-text">{lead.name}</span>
        {lead.stale && (
          <Badge variant="soft" className="shrink-0 gap-1 bg-warning-soft text-warning">
            <Clock className="h-3 w-3" aria-hidden /> Sin seguimiento
          </Badge>
        )}
      </span>
      {lead.property && <span className="truncate text-xs text-text-muted">{lead.property.title}</span>}
      <span className="flex items-center gap-2 text-xs text-text-muted">
        {showStatus && <Badge variant="soft">{LEAD_STATUS_LABELS[lead.status]}</Badge>}
        <span>{lead.lastContactAt ? `Contacto ${formatRelativeTime(lead.lastContactAt)}` : `Llegó ${formatRelativeTime(lead.createdAt)}`}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {lead.visitRequested && <CalendarClock className="h-3.5 w-3.5" aria-label="Pidió visita" />}
          {lead.visitDone && <CalendarCheck className="h-3.5 w-3.5 text-success" aria-label="Visita realizada" />}
          {lead.offerMade && <Handshake className="h-3.5 w-3.5 text-accent" aria-label="Hizo una oferta" />}
        </span>
      </span>
    </button>
  );
}

function LeadDetail({ lead, onUpdate }: { lead: LeadRow; onUpdate: (body: Record<string, unknown>) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    await onUpdate(body);
    setBusy(false);
  }

  async function addNote() {
    if (!note.trim()) return;
    await run({ note: note.trim() });
    setNote("");
  }

  const waDigits = lead.phone ? digitsOnly(lead.phone) : "";

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        {lead.property && (
          <p className="text-sm text-text-muted">
            Consultó por{" "}
            <Link href={`/propiedades/${lead.property.slug}`} className="font-medium text-accent hover:underline">
              {lead.property.title}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className={buttonClasses("secondary", "sm")}>
              <Phone className="h-4 w-4" aria-hidden /> Llamar
            </a>
          )}
          {waDigits.length >= 8 && (
            <a
              href={buildWhatsappLink(`Hola ${lead.name}! Te escribo por tu consulta${lead.property ? ` sobre «${lead.property.title}»` : ""}.`, waDigits)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "sm")}
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className={buttonClasses("secondary", "sm")}>
              <Mail className="h-4 w-4" aria-hidden /> Email
            </a>
          )}
        </div>
        <p className="text-xs text-text-muted">
          {[lead.phone, lead.email].filter(Boolean).join(" · ")}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">Etapa</h3>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => s !== lead.status && run({ status: s })}
              aria-pressed={s === lead.status}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                s === lead.status ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted hover:text-text"
              )}
            >
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-text-muted">
          <li className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" aria-hidden /> Visita solicitada: {lead.visitRequested ? "sí" : "no"}
          </li>
          <li className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Visita realizada: {lead.visitDone ? "sí" : "no"}
          </li>
          <li className="flex items-center gap-2">
            <Handshake className="h-4 w-4" aria-hidden /> Oferta: {lead.offerMade ? "sí" : "no"}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden /> Último contacto:{" "}
            {lead.lastContactAt ? formatRelativeTime(lead.lastContactAt) : "todavía no"}
          </li>
        </ul>
        <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => run({ contacted: true })}>
          Registrar contacto ahora
        </Button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">Mensajes del cliente</h3>
        <ul className="flex flex-col gap-2">
          {lead.messages.map((m, i) => (
            <li key={i} className="rounded-media bg-surface-2 p-3 text-sm text-text">
              <p className="whitespace-pre-line">{m.text}</p>
              <p className="mt-1 text-xs text-text-muted">{formatRelativeTime(m.at)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">Notas internas</h3>
        {lead.notes.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {lead.notes.map((n, i) => (
              <li key={i} className="rounded-media border border-border p-3 text-sm text-text">
                <p className="whitespace-pre-line">{n.text}</p>
                <p className="mt-1 text-xs text-text-muted">{formatRelativeTime(n.at)}</p>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Ej: quedamos en llamarlo el jueves"
          aria-label="Nueva nota"
          className="w-full resize-none rounded-media border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <Button size="sm" className="mt-2" disabled={busy || !note.trim()} onClick={addNote}>
          Guardar nota
        </Button>
      </section>
    </div>
  );
}
