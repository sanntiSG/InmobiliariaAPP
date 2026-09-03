"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils/format";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
};

export function CommentsSection({
  propertyId,
  initialComments,
  initialTotal,
}: {
  propertyId: string;
  initialComments: CommentItem[];
  initialTotal: number;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState(initialComments);
  const [total, setTotal] = useState(initialTotal);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    setError(null);

    try {
      const res = await fetch(`/api/properties/${propertyId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo publicar el comentario.");
      setComments((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar el comentario.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setComments(prev);
      setTotal((t) => t + 1);
    }
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-text">
        Comentarios {total > 0 && <span className="text-text-muted">({total})</span>}
      </h2>

      {session?.user ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí un comentario…"
            rows={3}
            maxLength={1000}
            className="w-full resize-none rounded-media border border-border bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={posting || !body.trim()}>
              {posting ? "Publicando…" : "Comentar"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          <Link href="/ingresar" className="font-medium text-accent hover:underline">
            Iniciá sesión
          </Link>{" "}
          para dejar un comentario.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {comments.length === 0 && (
          <p className="text-sm text-text-muted">Todavía no hay comentarios. ¡Sé el primero!</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-bold text-accent">
              {c.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">{c.user.name}</p>
                <p className="text-xs text-text-muted">{formatRelativeTime(c.createdAt)}</p>
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-text">{c.body}</p>
              {session?.user?.id === c.user.id && (
                <button
                  onClick={() => remove(c.id)}
                  className="mt-1 text-xs font-medium text-text-muted hover:text-danger"
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
