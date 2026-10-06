/**
 * Utilidades de YouTube sin dependencias ni claves — puras, así sirven tanto
 * en el formulario (cliente) como en el servidor.
 */

export type VideoOrientation = "vertical" | "horizontal";

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
/** Handles de YouTube: letras, números, punto, guion y guion bajo (3–30). */
const HANDLE_RE = /^[A-Za-z0-9._-]{3,30}$/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/**
 * Extrae el id de un link de video de YouTube: `watch?v=`, `youtu.be/`,
 * `/shorts/`, `/embed/`, `/live/`. Los Shorts son verticales (9:16).
 */
export function parseYouTubeVideoUrl(raw: string): { videoId: string; orientation: VideoOrientation } | null {
  const url = toUrl(raw);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let orientation: VideoOrientation = "horizontal";

  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (parts[0] === "shorts") {
    id = parts[1] ?? null;
    orientation = "vertical";
  } else if (parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
    id = parts[1] ?? null;
  }

  return id && VIDEO_ID_RE.test(id) ? { videoId: id, orientation } : null;
}

export type ChannelInput = { kind: "id"; channelId: string } | { kind: "handle"; handle: string };

/**
 * Interpreta lo que pega la inmobiliaria como "su canal": la URL
 * (`/channel/UC…`, `/@handle`), un `@handle` suelto o directamente el id `UC…`.
 * No hace ninguna consulta de red.
 */
export function parseChannelInput(raw: string): ChannelInput | null {
  const value = raw.trim();
  if (!value) return null;

  if (CHANNEL_ID_RE.test(value)) return { kind: "id", channelId: value };
  if (value.startsWith("@") && HANDLE_RE.test(value.slice(1))) return { kind: "handle", handle: value.slice(1) };

  const url = toUrl(value);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "channel" && parts[1] && CHANNEL_ID_RE.test(parts[1])) return { kind: "id", channelId: parts[1] };
  if (parts[0]?.startsWith("@") && HANDLE_RE.test(parts[0].slice(1))) return { kind: "handle", handle: parts[0].slice(1) };
  return null;
}

export const youtubeWatchUrl = (videoId: string, orientation: VideoOrientation = "horizontal") =>
  orientation === "vertical" ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;

/** Miniatura estándar de YouTube (siempre existe, a diferencia de `maxresdefault`). */
export const youtubeThumbnail = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

/** URL del reproductor sin cookies de seguimiento hasta que la persona le da play. */
export const youtubeEmbedUrl = (videoId: string) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
