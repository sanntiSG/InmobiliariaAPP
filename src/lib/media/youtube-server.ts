import { memo } from "@/lib/intelligence/cache";
import {
  CHANNEL_ID_RE,
  VIDEO_ID_RE,
  parseChannelInput,
  youtubeWatchUrl,
  type ChannelInput,
  type VideoOrientation,
} from "./youtube";

/**
 * Acceso a YouTube SIN clave ni OAuth: el feed RSS público de cada canal (los
 * últimos ~15 videos, Shorts incluidos) y oEmbed para validar un video suelto.
 * Todas las URLs se arman acá con hosts fijos a partir de ids validados por
 * regex — nunca se hace un fetch a una URL que haya enviado el usuario (SSRF).
 */

const FETCH_TIMEOUT_MS = 6_000;
const FEED_TTL_MS = 15 * 60_000;
const UA = "Mozilla/5.0 (compatible; InmobiliariaBot/1.0)";

export class YouTubeError extends Error {}

async function fetchText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "es-AR,es;q=0.9" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new YouTubeError(`YouTube respondió ${res.status}`);
  return res.text();
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

export type ChannelVideo = {
  videoId: string;
  title: string;
  orientation: VideoOrientation;
  publishedAt: string | null;
};

export type ChannelFeed = { channelId: string; title: string; videos: ChannelVideo[] };

/** Videos recientes del canal (cacheado 15 min por canal). */
export function fetchChannelFeed(channelId: string): Promise<ChannelFeed> {
  if (!CHANNEL_ID_RE.test(channelId)) return Promise.reject(new YouTubeError("Canal inválido"));

  return memo(`yt-feed:${channelId}`, FEED_TTL_MS, async () => {
    const xml = await fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      "application/atom+xml, application/xml;q=0.9"
    );

    const firstEntry = xml.indexOf("<entry>");
    const header = firstEntry === -1 ? xml : xml.slice(0, firstEntry);
    const title = decodeXml(/<title>([\s\S]*?)<\/title>/.exec(header)?.[1] ?? "").trim();

    const videos: ChannelVideo[] = [];
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const entry = match[1]!;
      const videoId = /<yt:videoId>([\s\S]*?)<\/yt:videoId>/.exec(entry)?.[1]?.trim();
      if (!videoId || !VIDEO_ID_RE.test(videoId)) continue;
      const href = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(entry)?.[1] ?? "";
      videos.push({
        videoId,
        title: decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? "").trim() || "Video de YouTube",
        orientation: href.includes("/shorts/") ? "vertical" : "horizontal",
        publishedAt: /<published>([\s\S]*?)<\/published>/.exec(entry)?.[1]?.trim() ?? null,
      });
    }
    return { channelId, title, videos };
  });
}

/** Id de canal (`UC…`) a partir de lo que pegó la persona, consultando YouTube sólo si es un @handle. */
export async function resolveChannelId(raw: string): Promise<string> {
  const parsed: ChannelInput | null = parseChannelInput(raw);
  if (!parsed) {
    throw new YouTubeError("No reconocimos ese canal. Pegá el link de tu canal (youtube.com/@tucanal) o su id (UC…).");
  }
  if (parsed.kind === "id") return parsed.channelId;

  // Host fijo; el handle ya pasó por regex en parseChannelInput.
  let html: string;
  try {
    html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(parsed.handle)}`, "text/html");
  } catch {
    throw new YouTubeError(
      "No pudimos leer ese canal. Probá pegando el link con el id (youtube.com/channel/UC…): lo encontrás en YouTube Studio → Personalización → Información básica."
    );
  }

  // El `<link rel="canonical">` es el id del propio canal (otros `channelId` de la página pueden ser de recomendados).
  const id =
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /<meta itemprop="(?:identifier|channelId)" content="(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1];
  if (!id) {
    throw new YouTubeError(
      "No encontramos ese canal. Revisá el @usuario o pegá el link con el id (youtube.com/channel/UC…)."
    );
  }
  return id;
}

export type ResolvedVideo = { videoId: string; title: string; orientation: VideoOrientation };

/**
 * Valida un video suelto con oEmbed (público): confirma que existe, no es
 * privado y se puede embeber, y trae su título. La orientación se deduce del
 * link (/shorts/) o, si no, de las proporciones que informa oEmbed.
 */
export async function resolveVideo(videoId: string, hintedOrientation: VideoOrientation): Promise<ResolvedVideo> {
  if (!VIDEO_ID_RE.test(videoId)) throw new YouTubeError("Video inválido");

  const target = encodeURIComponent(youtubeWatchUrl(videoId));
  let data: { title?: string; width?: number; height?: number };
  try {
    data = JSON.parse(await fetchText(`https://www.youtube.com/oembed?url=${target}&format=json`, "application/json"));
  } catch {
    throw new YouTubeError(
      "No pudimos usar ese video: puede ser privado, no permitir incrustarlo o no existir. Probá con otro."
    );
  }

  const tall = typeof data.width === "number" && typeof data.height === "number" && data.height > data.width;
  return {
    videoId,
    title: (data.title ?? "Video de YouTube").slice(0, 120),
    orientation: hintedOrientation === "vertical" || tall ? "vertical" : "horizontal",
  };
}
