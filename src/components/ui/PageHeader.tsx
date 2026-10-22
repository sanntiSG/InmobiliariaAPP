import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Encabezado de página con el lenguaje del hero en voz baja: eyebrow en pastilla, título de Bricolage
 * liviano y bajada. Entra con un `rise` escalonado (CSS, sin JS: no parpadea al hidratar). Sirve en
 * componentes de servidor y de cliente.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header rise-group flex flex-col", className)}>
      {eyebrow && (
        <p className="hero-eyebrow">
          <span className="hero-eyebrow-dot" aria-hidden="true" />
          {eyebrow}
        </p>
      )}
      <h1 className="page-title">{title}</h1>
      {lead && <p className="page-lead">{lead}</p>}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
