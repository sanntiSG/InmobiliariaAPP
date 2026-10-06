"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

/** Refresca el rol de la sesión (el permiso recién concedido) y sigue a /publicar. */
export function ContinueAfterApproval() {
  const router = useRouter();
  const { update } = useSession();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    await update().catch(() => {});
    router.push("/publicar");
    router.refresh();
  }

  return (
    <Button onClick={go} disabled={busy}>
      {busy ? "Un momento…" : "Crear mi inmobiliaria"}
    </Button>
  );
}
