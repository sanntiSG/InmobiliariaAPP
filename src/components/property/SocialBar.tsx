"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Bookmark, Star } from "lucide-react";
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
        <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} aria-hidden />
        {formatCompactNumber(likes)}
      </Button>

      <Button variant={favorited ? "primary" : "secondary"} size="sm" onClick={toggleFavorite}>
        <Bookmark className="h-4 w-4" fill={favorited ? "currentColor" : "none"} aria-hidden />
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
              <Star
                className={cn("h-4 w-4 transition-colors", star <= (hoverStar ?? myRating ?? 0) ? "text-warning" : "text-border")}
                fill="currentColor"
                aria-hidden
              />
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
