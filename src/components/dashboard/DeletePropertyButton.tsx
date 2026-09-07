"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

export function DeletePropertyButton({ propertyId, title }: { propertyId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/dashboard/properties/${propertyId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-text-muted">¿Eliminar?</span>
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
    );
  }

  return (
    <IconButton
      variant="ghost"
      size={32}
      aria-label={`Eliminar ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setConfirming(true);
      }}
    >
      <Trash2 className="h-4 w-4 text-danger" aria-hidden />
    </IconButton>
  );
}
