"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Eye } from "lucide-react";

function Banner({ agencies }: { agencies: { id: string; name: string }[] }) {
  const id = useSearchParams().get("agencyId");
  const pathname = usePathname();
  const name = id ? agencies.find((a) => a.id === id)?.name : null;
  if (!name) return null;
  return (
    <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card bg-accent-soft px-4 py-3 text-sm text-text" role="status">
      <span className="inline-flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          Estás viendo el panel de <strong className="font-semibold">{name}</strong>.
        </span>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 font-semibold text-accent">
        <Link href={pathname} className="hover:underline">
          Ver todas las inmobiliarias
        </Link>
        <Link href="/admin/inmobiliarias" className="hover:underline">
          Volver al admin
        </Link>
      </span>
    </p>
  );
}

/**
 * Cuando el admin mira el panel de una inmobiliaria (`?agencyId=`), una franja se lo recuerda y le da la salida. Así no hay
 * duda de "como quién" está mirando ni cómo volver.
 */
export function AdminContextBanner({ agencies }: { agencies: { id: string; name: string }[] }) {
  return (
    <Suspense fallback={null}>
      <Banner agencies={agencies} />
    </Suspense>
  );
}
