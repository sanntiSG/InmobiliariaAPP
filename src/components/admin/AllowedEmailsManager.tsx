"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

type AllowedEmailRow = {
  _id: string;
  email: string;
  status: "pending" | "awaiting_agency" | "active";
  agencyId: { _id: string; name: string; slug: string } | null;
  createdAt: string;
};

type AgencyOption = {
  _id: string;
  name: string;
};

/** Sentinel del `<select>` — "" en value ya significa "sin inmobiliaria", así que se usa una key propia. */
const NO_AGENCY = "__none__";

const STATUS_LABEL: Record<AllowedEmailRow["status"], string> = {
  pending: "Pendiente",
  awaiting_agency: "Falta inmobiliaria",
  active: "Activo",
};

const STATUS_CLASS: Record<AllowedEmailRow["status"], string> = {
  pending: "bg-warning-soft text-warning",
  awaiting_agency: "bg-accent-soft text-accent",
  active: "bg-success-soft text-success",
};

export function AllowedEmailsManager({
  initialEmails,
  agencies,
  lockedAgencyId,
}: {
  initialEmails: AllowedEmailRow[];
  agencies: AgencyOption[];
  /**
   * Si viene, este panel autoriza siempre para esta inmobiliaria: oculta el
   * selector y no hace falta elegir nada — es el panel "Accesos de esta
   * inmobiliaria" embebido en /admin/inmobiliarias/[id]/editar.
   */
  lockedAgencyId?: string;
}) {
  const router = useRouter();
  const [emails, setEmails] = useState(initialEmails);
  const [newEmail, setNewEmail] = useState("");
  const [selectedAgency, setSelectedAgency] = useState(NO_AGENCY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setError(null);
    setLoading(true);

    const agencyId = lockedAgencyId ?? (selectedAgency === NO_AGENCY ? undefined : selectedAgency);

    const res = await fetch("/api/admin/allowed-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), agencyId }),
    });

    const data = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo autorizar el email.");
      return;
    }

    // Recargar la lista
    setNewEmail("");
    router.refresh();
    // Optimistic update con los datos populados
    const agency = agencies.find((a) => a._id === agencyId);
    setEmails((prev) => [
      {
        _id: data._id,
        email: newEmail.trim().toLowerCase(),
        status: "pending",
        agencyId: agency ? { _id: agency._id, name: agency.name, slug: "" } : null,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setDeletingId(id);
    const res = await fetch(`/api/admin/allowed-emails/${id}`, { method: "DELETE" });
    setDeletingId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDeleteError(data?.error ?? "No se pudo revocar el permiso.");
      return;
    }

    setEmails((prev) => prev.filter((e) => e._id !== id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Formulario para agregar email */}
      <div className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-text">
          {lockedAgencyId ? "Darle acceso a un email" : "Autorizar nuevo email"}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {lockedAgencyId
            ? "Esa persona va a poder gestionar esta inmobiliaria — entrando con Google, o por contraseña si ya tiene una cuenta creada."
            : 'Elegí una inmobiliaria ya creada, o dejá "Sin inmobiliaria" para que la persona cree la suya la primera vez que entre con Google.'}
        </p>

        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="allowed-email" className="mb-1 block text-sm font-medium text-text">
              Email
            </label>
            <input
              id="allowed-email"
              type="email"
              required
              placeholder="correo@ejemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="
                h-11 w-full rounded-pill border border-border bg-bg px-4 text-sm text-text
                placeholder:text-text-muted
                focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20
                transition-colors duration-150
              "
            />
          </div>

          {!lockedAgencyId && (
            <div className="sm:w-56">
              <label htmlFor="allowed-agency" className="mb-1 block text-sm font-medium text-text">
                Inmobiliaria
              </label>
              <select
                id="allowed-agency"
                value={selectedAgency}
                onChange={(e) => setSelectedAgency(e.target.value)}
                className="
                  h-11 w-full rounded-pill border border-border bg-bg px-4 text-sm text-text
                  focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20
                  transition-colors duration-150
                "
              >
                <option value={NO_AGENCY}>Sin inmobiliaria (la crea el usuario)</option>
                {agencies.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button type="submit" disabled={loading || !newEmail.trim()} size="md">
            {loading ? "Autorizando…" : "Autorizar"}
          </Button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Lista de emails autorizados */}
      <div className="rounded-card bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-bold text-text">
            Emails autorizados
            <span className="ml-2 text-sm font-normal text-text-muted">({emails.length})</span>
          </h2>
          {deleteError && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {deleteError}
            </p>
          )}
        </div>

        {emails.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-text-muted">No hay emails autorizados todavía.</p>
          </div>
        ) : (
          <div>
            {emails.map((entry, i) => (
              <div
                key={entry._id}
                className={cn(
                  "flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4",
                  i > 0 && "border-t border-border"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">{entry.email}</p>
                  <p className="text-sm text-text-muted">
                    {!lockedAgencyId &&
                      (entry.agencyId ? `Inmobiliaria: ${entry.agencyId.name} · ` : "Sin inmobiliaria asociada · ")}
                    {new Date(entry.createdAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium",
                      STATUS_CLASS[entry.status]
                    )}
                  >
                    {STATUS_LABEL[entry.status]}
                  </span>

                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deletingId === entry._id}
                    onClick={() => handleDelete(entry._id)}
                  >
                    {deletingId === entry._id ? "Revocando…" : "Revocar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
