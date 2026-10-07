"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

/** Refresca el rol de la sesión (el permiso recién concedido) y sigue a /publicar. */
export function ContinueAfterApproval() {
  const { update } = useSession();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    // Refresca la cookie si puede; no depende de eso: /publicar verifica contra la base.
    await update().catch(() => {});
    // Carga completa (no router.push): siempre con la cookie y los datos actuales.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- carga completa a propósito: router.push puede llegar con la cookie vieja
    window.location.href = "/publicar";
  }

  return (
    <Button onClick={go} disabled={busy}>
      {busy ? "Un momento…" : "Crear mi inmobiliaria"}
    </Button>
  );
}
