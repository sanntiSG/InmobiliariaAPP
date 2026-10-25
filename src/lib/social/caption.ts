/**
 * Texto y hashtags sugeridos para acompañar la imagen de una publicación. Son reglas, no IA: el mismo recurso de siempre
 * (gancho según la operación, los datos de la propiedad contados con las mismas palabras que el asesor y una llamada a la
 * acción) con variantes elegidas por una semilla, así regenerar la publicación también cambia el texto. Función pura.
 */
import type { Operation } from "@/config/filters";
import { list, pick, seedOf } from "@/lib/advisor/compose/format";
import { typeGender, typeLabel } from "@/lib/advisor/compose/vocab";
import { describeLine, highlights, placeOf, type PropertyFacts } from "@/lib/agents/knowledge/facts";

export type Caption = {
  /** El texto, con saltos de línea entre párrafos (sin hashtags). */
  text: string;
  /** Con la almohadilla, en CamelCase y sin tildes: `#CasaEnVenta`. */
  hashtags: string[];
};

export type CaptionInput = {
  agencyName: string;
  /** Cambia el texto entre generaciones (la propiedad + la versión de la publicación). */
  seed: string | number;
  /** Enlace a la ficha (completo, con `https://`). Sin él, el texto no lo menciona. */
  url?: string | null;
};

const MAX_HASHTAGS = 12;
const MAX_TAG_LENGTH = 30;

/** "Villa Urquiza" → "VillaUrquiza"; "Núñez" → "Nunez". `null` si no queda nada. */
export function hashtagify(raw: string): string | null {
  const words = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  // Las siglas cortas se respetan ("CABA", "PH"); el resto va en CamelCase.
  const camel = (w: string) => (/^[A-Z]{2,4}$/.test(w) ? w : `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`);
  const body = words.map(camel).join("").slice(0, MAX_TAG_LENGTH);
  return /^\d+$/.test(body) ? null : `#${body}`;
}

/** Se vive en ella: el gancho puede hablar de "hogar" o de "mudarse". Los demás tipos (oficina, local, galpón, terreno) son para trabajar o construir. */
const RESIDENTIAL = new Set(["casa", "departamento", "ph", "quinta"]);

function hook(p: PropertyFacts, seed: number): string {
  const op = p.operation as Operation;
  const noun = typeLabel(p.type, false);
  const article = typeGender(p.type).the === "las" ? "una" : "un";
  const place = placeOf(p);
  const home = RESIDENTIAL.has(p.type);
  if (op === "venta") {
    return pick(
      home
        ? [`Tu próximo hogar está en ${place}.`, `Hay ${article} ${noun} en venta en ${place} que tenés que conocer.`, `Una oportunidad para vivir en ${place}.`]
        : [
            p.type === "terreno" ? `Tu próximo proyecto empieza en ${place}.` : `Tu próximo negocio está en ${place}.`,
            `Hay ${article} ${noun} en venta en ${place} que tenés que conocer.`,
            `Una oportunidad para invertir en ${place}.`,
          ],
      seed
    );
  }
  if (op === "alquiler_temporal") {
    return pick([`Escapate a ${place}: ${article} ${noun} para tu próxima estadía.`, `Tu próxima estadía en ${place} te está esperando.`], seed);
  }
  return pick(
    home
      ? [`Alquilá ${article} ${noun} en ${place}.`, `Tu próximo alquiler está en ${place}.`, `Mudate a ${place}: ${article} ${noun} te espera.`]
      : [`Alquilá ${article} ${noun} en ${place}.`, `Tu próximo alquiler está en ${place}.`],
    seed
  );
}

const ACTION = [
  "Escribinos y coordinamos una visita.",
  "Consultanos por mensaje y te contamos todo.",
  "Mandanos un mensaje y agendamos tu visita.",
] as const;

function tags(p: PropertyFacts, agencyName: string): string[] {
  const op = p.operation as Operation;
  const noun = typeLabel(p.type, false);
  const base = op === "venta" ? ["En Venta", "Propiedades En Venta"] : op === "alquiler" ? ["En Alquiler", "Alquileres"] : ["Alquiler Temporal", "Escapadas"];
  const candidates = [
    hashtagify(`${noun} ${base[0]}`),
    hashtagify(base[1]!),
    p.neighborhood ? hashtagify(p.neighborhood) : null,
    hashtagify(p.city),
    hashtagify(noun),
    hashtagify("Inmobiliaria"),
    hashtagify("Argentina"),
    p.hasTour ? hashtagify("Recorrido 360") : null,
    p.hasAmbient ? hashtagify("Portada viva") : null,
    ...p.amenities.slice(0, 3).map((a) => hashtagify(a.replace(/_/g, " "))),
    p.garages && p.garages > 0 ? hashtagify("Cochera") : null,
    hashtagify(agencyName),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of candidates) {
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** El texto y los hashtags sugeridos para una propiedad (el usuario los puede editar al copiarlos). */
export function buildCaption(p: PropertyFacts, input: CaptionInput): Caption {
  const seed = seedOf(String(input.seed), p.id);
  const paragraphs: string[] = [hook(p, seed), describeLine(p)];

  const extras = highlights(p, 4);
  if (extras.length > 0) paragraphs.push(`Tiene ${list(extras)}.`);

  const closing: string[] = [pick(ACTION, seed >>> 3)];
  if (input.url) closing.push(`Más fotos y datos: ${input.url}`);
  closing.push(`${input.agencyName}`);
  paragraphs.push(closing.join("\n"));

  return { text: paragraphs.join("\n\n"), hashtags: tags(p, input.agencyName) };
}

/** Texto + hashtags en un solo bloque, listo para pegar en la red social. */
export const captionToString = (c: Caption): string => `${c.text}\n\n${c.hashtags.join(" ")}`;
