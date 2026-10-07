"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Eliminar una inmobiliaria borra TODO lo suyo y las cuentas de su equipo, y no
 * se puede deshacer — por eso la confirmación dice con números qué se va a
 * perder, y el botón de confirmar es explícito.
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
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-danger hover:underline">
        Eliminar
      </button>

      <Sheet open={open} onClose={() => !deleting && setOpen(false)} title={`Eliminar ${name}`} side="right">
        <div className="flex flex-col gap-5">
          <p className="flex items-start gap-2 rounded-media bg-danger-soft p-4 text-sm text-text">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <span>
              <strong className="font-semibold">Esto no se puede deshacer.</strong> Se borra todo lo de esta
              inmobiliaria.
            </span>
          </p>

          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
            <li>{plural(propertyCount, "propiedad", "propiedades")}, con sus fotos, recorridos 360°, videos y estadísticas.</li>
            <li>Sus clientes potenciales, seguidores, logo y portada.</li>
            <li>
              {memberCount > 0
                ? `Las cuentas de ${plural(memberCount, "persona del equipo", "personas del equipo")}, con su actividad (favoritos, comentarios, notificaciones…).`
                : "Los permisos concedidos a su equipo."}
            </li>
          </ul>
          <p className="text-sm text-text-muted">
            Quienes la gestionaban pueden volver a registrarse, pero empiezan de cero y tienen que pedir permiso otra
            vez para crear una inmobiliaria.
          </p>

          {error && (
            <p className="rounded-media bg-danger-soft p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando…" : "Sí, eliminar todo"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
