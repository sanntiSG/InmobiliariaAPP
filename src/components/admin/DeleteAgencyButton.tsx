"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Eliminar una inmobiliaria borra TODO lo suyo y las cuentas de su equipo, y no
 * se puede deshacer — por eso la confirmación dice con números qué se va a
 * perder.
 */
export function DeleteAgencyButton({
  agencyId,
  name,
  propertyCount,
  memberCount,
}: {
  agencyId: string;
  name: string;
  propertyCount: number;
  memberCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo eliminar.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-sm font-medium text-danger hover:underline"
      >
        Eliminar
      </button>

      <ConfirmDialog
        open={open}
        title={`¿Eliminar ${name}?`}
        busy={deleting}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      >
        <p>
          <strong className="font-semibold text-text">No se puede deshacer.</strong> Se borran{" "}
          {plural(propertyCount, "propiedad", "propiedades")} con sus fotos, videos y estadísticas, sus clientes
          potenciales y seguidores.
        </p>
        <p>
          {memberCount > 0
            ? `También las cuentas de ${plural(memberCount, "persona del equipo", "personas del equipo")}, con toda su actividad. `
            : "También los permisos de su equipo. "}
          Pueden volver a registrarse, pero tendrán que pedir permiso de nuevo.
        </p>
      </ConfirmDialog>
    </>
  );
}
