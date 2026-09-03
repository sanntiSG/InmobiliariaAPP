"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAgencyButton({ agencyId, name }: { agencyId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/admin/agencies/${agencyId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      router.refresh();
    } else {
      setError(data?.error ?? "No se pudo eliminar.");
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">¿Eliminar {name}?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-pill bg-danger px-2.5 py-1 text-xs font-semibold text-white"
          >
            {deleting ? "…" : "Sí"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-semibold text-text"
          >
            No
          </button>
        </div>
        {error && <span className="max-w-[220px] text-right text-xs text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-sm font-medium text-danger hover:underline"
    >
      Eliminar
    </button>
  );
}
