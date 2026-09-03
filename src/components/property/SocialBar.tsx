"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatCompactNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type SocialBarProps = {
  propertyId: string;
  isAuthenticated: boolean;
  initialLiked: boolean;
  initialFavorited: boolean;
  initialLikes: number;
  initialSaves: number;
  initialRatingAvg: number;
  initialRatingCount: number;
  initialMyRating: number | null;
};

export function SocialBar({
  propertyId,
  isAuthenticated,
  initialLiked,
  initialFavorited,
  initialLikes,
  initialSaves,
  initialRatingAvg,
  initialRatingCount,
  initialMyRating,
}: SocialBarProps) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [favorited, setFavorited] = useState(initialFavorited);
  const [saves, setSaves] = useState(initialSaves);
  const [ratingAvg, setRatingAvg] = useState(initialRatingAvg);
  const [ratingCount, setRatingCount] = useState(initialRatingCount);
  const [myRating, setMyRating] = useState(initialMyRating);
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  function requireAuth(): boolean {
    if (isAuthenticated) return true;
    router.push("/ingresar");
    return false;
  }

  async function toggleLike() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const prevLiked = liked;
    const prevLikes = likes;
    setLiked(!prevLiked);
    setLikes(prevLiked ? prevLikes - 1 : prevLikes + 1);
    try {
      const res = await fetch(`/api/properties/${propertyId}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLiked(data.liked);
      setLikes(data.likes);
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const prevFav = favorited;
    const prevSaves = saves;
    setFavorited(!prevFav);
    setSaves(prevFav ? prevSaves - 1 : prevSaves + 1);
    try {
      const res = await fetch(`/api/properties/${propertyId}/favorite`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFavorited(data.favorited);
      setSaves(data.saves);
    } catch {
      setFavorited(prevFav);
      setSaves(prevSaves);
    } finally {
      setBusy(false);
    }
  }

  async function rate(value: number) {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const prev = { myRating, ratingAvg, ratingCount };
    setMyRating(value);
    try {
      const res = await fetch(`/api/properties/${propertyId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRatingAvg(data.ratingAvg);
      setRatingCount(data.ratingCount);
      setMyRating(data.myRating);
    } catch {
      setMyRating(prev.myRating);
      setRatingAvg(prev.ratingAvg);
      setRatingCount(prev.ratingCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={liked ? "primary" : "secondary"} size="sm" onClick={toggleLike}>
        <HeartIcon filled={liked} />
        {formatCompactNumber(likes)}
      </Button>

      <Button variant={favorited ? "primary" : "secondary"} size="sm" onClick={toggleFavorite}>
        <BookmarkIcon filled={favorited} />
        {favorited ? "Guardado" : "Guardar"}
      </Button>

      <div className="flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 h-9">
        <div className="flex" onMouseLeave={() => setHoverStar(null)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Calificar con ${star} estrella${star > 1 ? "s" : ""}`}
              onMouseEnter={() => setHoverStar(star)}
              onClick={() => rate(star)}
              className="p-0.5"
            >
              <StarIcon filled={star <= (hoverStar ?? myRating ?? 0)} />
            </button>
          ))}
        </div>
        <span className="text-sm text-text-muted">
          {ratingCount > 0 ? `${ratingAvg.toFixed(1)} (${ratingCount})` : "Sin calificar"}
        </span>
      </div>
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} aria-hidden>
      <path
        d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4c2-.3 3.5.8 4.5 2.2C11 4.8 12.5 3.7 14.5 4 18 4.5 19.5 8 21.5 11.5 19 15.65 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} aria-hidden>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 transition-colors", filled ? "text-warning" : "text-border")}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7L12 2.5Z" />
    </svg>
  );
}
