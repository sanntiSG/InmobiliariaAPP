"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellPlus, BellRing } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Seguir / dejar de seguir a una inmobiliaria. Optimista: cambia al toque y,
 * si el servidor falla, vuelve atrás. Sin sesión, lleva a ingresar y vuelve
 * a este mismo perfil.
 */
export function FollowButton({
  agencyId,
  agencySlug,
  isAuthenticated,
  initialFollowing,
  initialFollowers,
}: {
  agencyId: string;
  agencySlug: string;
  isAuthenticated: boolean;
  initialFollowing: boolean;
  initialFollowers: number;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!isAuthenticated) {
      router.push(`/ingresar?callbackUrl=${encodeURIComponent(`/inmobiliarias/${agencySlug}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const prev = { following, followers };
    setFollowing(!following);
    setFollowers((n) => Math.max(0, n + (following ? -1 : 1)));
    try {
      const res = await fetch(`/api/agencies/${agencyId}/follow`, { method: following ? "DELETE" : "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFollowing(data.following);
      setFollowers(data.followers);
    } catch {
      setFollowing(prev.following);
      setFollowers(prev.followers);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant={following ? "secondary" : "primary"} onClick={toggle} aria-pressed={following}>
        {following ? <BellRing className="h-4 w-4" aria-hidden /> : <BellPlus className="h-4 w-4" aria-hidden />}
        {following ? "Siguiendo" : "Seguir"}
      </Button>
      <span className="text-sm text-text-muted" aria-live="polite">
        {followers} {followers === 1 ? "seguidor" : "seguidores"}
      </span>
    </div>
  );
}
