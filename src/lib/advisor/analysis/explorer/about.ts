/**
 * "Preguntale al asesor" desde la ficha: cuenta una propiedad concreta de forma ordenada (texto natural + datos en
 * grilla) y dice al final si la recomienda según las preferencias de la persona. Sólo usa datos públicos de una
 * propiedad publicada y, si hay sesión, las preferencias y el perfil de gustos de esa misma persona.
 */
import { Types } from "mongoose";
import { Property } from "@/lib/db/models/Property";
import { User } from "@/lib/db/models/User";
import { describeLine, factItems, firstSentences, highlights, toFacts, type PropertyDocLike, type PropertyFacts } from "@/lib/agents/knowledge/facts";
import { matchPreferences, type Fit, type PrefInput } from "@/lib/agents/knowledge/preferences";
import { getTasteProfile } from "@/lib/intelligence/user-profile";
import { list, pick, quote } from "../../compose/format";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { defaultSuggestions } from "../../compose/labels";
import type { AdvisorAction, AdvisorBlock, Slots, SuggestionQuery } from "../../types";
import type { Handler, HandlerResult } from "../types";

const lcFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Sugerencias después de contar una propiedad: ¿está bien de precio?, otras parecidas, y recomendaciones si hay cuenta. */
function followUpsFor(p: PropertyFacts, signedIn: boolean): SuggestionQuery[] {
  const similar: Slots = { types: [p.type as never], operation: p.operation as never, zones: [p.neighborhood ?? p.city] };
  return dedupeSuggestions([
    sug("explorer.price_check", "¿Está bien de precio?", { slots: { propertyIds: [p.id] } }),
    sug("explorer.search", `Ver más en ${p.neighborhood ?? p.city}`, { slots: similar }),
    ...(signedIn ? [sug("explorer.recommend", "Recomendame otras para mí")] : []),
  ]);
}

/** Frase de cierre (el veredicto dicho con naturalidad) + el bloque visual que lo acompaña. */
function verdictOf(
  fit: Fit,
  facts: PropertyFacts,
  signedIn: boolean,
  seed: number
): { sentence: string; block: Extract<AdvisorBlock, { type: "verdict" }>; actions: AdvisorAction[] } {
  const loginHref = `/ingresar?callbackUrl=${encodeURIComponent(`/propiedades/${facts.slug}`)}`;
  const adjust: AdvisorAction = { label: "Ajustar mis preferencias", href: "/perfil", kind: signedIn ? "primary" : "secondary" };

  if (!signedIn) {
    return {
      sentence: pick(
        [
          "No encontré tus preferencias porque no iniciaste sesión. Si entrás y me contás qué buscás, te digo si te conviene.",
          "Para decirte si te conviene necesito conocer tus preferencias, y no las encuentro porque no iniciaste sesión. Entrá y ajustalas, y lo vemos.",
        ],
        seed
      ),
      block: {
        type: "verdict",
        tone: "unknown",
        title: "No encontré tus preferencias",
        matches: [],
        misses: [],
        note: "Iniciá sesión y contame qué buscás (zona, tipo y presupuesto) para decirte si esta propiedad te conviene.",
        actions: [{ label: "Iniciar sesión", href: loginHref, kind: "primary" }, adjust],
      },
      actions: [{ label: "Iniciar sesión", href: loginHref, kind: "primary" }],
    };
  }

  if (fit.source === "none") {
    return {
      sentence: pick(
        [
          "No encontré tus preferencias guardadas. Ajustalas en tu perfil —zona, tipo y presupuesto— y te digo si te conviene.",
          "Todavía no tengo tus preferencias, así que no puedo decirte si te conviene. Completalas en tu perfil y volvé a preguntarme.",
        ],
        seed
      ),
      block: {
        type: "verdict",
        tone: "unknown",
        title: "No encontré tus preferencias",
        matches: [],
        misses: [],
        note: "Guardá tus preferencias en tu perfil (zona, tipo y presupuesto) y te digo si esta propiedad te conviene.",
        actions: [adjust],
      },
      actions: [adjust],
    };
  }

  const matches = fit.criteria.filter((c) => c.result === "match").map((c) => c.text);
  const misses = fit.criteria.filter((c) => c.result === "miss" || c.result === "near").map((c) => c.text);
  const unknowns = fit.criteria.filter((c) => c.result === "unknown").map((c) => c.text);
  const basis = fit.source === "taste" ? "según lo que venís mirando" : "según lo que buscás";
  const firstMiss = misses[0] ? lcFirst(misses[0]).replace(/\.$/, "") : null;

  if (fit.verdict === "yes") {
    return {
      sentence: pick(
        [`Te la recomiendo: ${basis}, encaja bien.`, `Sí, te la recomiendo. ${basis[0]!.toUpperCase()}${basis.slice(1)}, es una buena opción.`],
        seed
      ),
      block: { type: "verdict", tone: "yes", title: "Te la recomiendo", matches, misses, note: unknowns[0], actions: [] },
      actions: [],
    };
  }
  if (fit.verdict === "maybe") {
    return {
      sentence: firstMiss
        ? pick([`Puede interesarte, aunque no encaja en todo: ${firstMiss}.`, `Es una opción posible, con una reserva: ${firstMiss}.`], seed)
        : "Puede interesarte, aunque no coincide en todo lo que buscás.",
      block: { type: "verdict", tone: "maybe", title: "Puede interesarte", matches, misses, note: unknowns[0], actions: [] },
      actions: [],
    };
  }
  if (fit.verdict === "no") {
    return {
      sentence: firstMiss
        ? pick([`No te la recomendaría: ${firstMiss}.`, `Por lo que me contaste, no es para vos: ${firstMiss}.`], seed)
        : "No te la recomendaría: se aleja de lo que buscás.",
      block: { type: "verdict", tone: "no", title: "No la veo para vos", matches, misses, note: unknowns[0], actions: [] },
      actions: [],
    };
  }
  return {
    sentence: "Tengo pocos datos tuyos para compararla bien. Sumá más preferencias en tu perfil y te lo digo con más seguridad.",
    block: {
      type: "verdict",
      tone: "unknown",
      title: "Todavía no puedo decirte",
      matches,
      misses,
      note: unknowns[0] ?? "Sumá más preferencias (zona, tipo, presupuesto) para poder compararla.",
      actions: [adjust],
    },
    actions: [adjust],
  };
}

export const aboutProperty: Handler = async (env): Promise<HandlerResult> => {
  const id = env.slots.propertyIds?.[0] ?? env.context.focusPropertyId ?? env.context.resultIds?.[0];
  if (!id || !Types.ObjectId.isValid(id)) {
    return {
      lead: "¿De cuál propiedad querés que te cuente? Abrí su ficha y tocá el botón para preguntarme, o buscá algunas y elegí una.",
      blocks: [],
      followUps: defaultSuggestions(env.mode).slice(0, 4),
    };
  }

  const doc = (await Property.findOne({ _id: id, status: "published" })
    .select("title slug description type operation price address.neighborhood address.city features amenities media.hasTour3d media.hasAmbientCover media.videos agencyId")
    .populate({ path: "agencyId", select: "name slug" })
    .lean()) as PropertyDocLike | null;

  if (!doc) {
    return {
      lead: "Esa propiedad ya no está disponible. Si querés, te muestro otras parecidas.",
      blocks: [],
      followUps: defaultSuggestions(env.mode).slice(0, 4),
    };
  }

  const facts = toFacts(doc);
  const signedIn = !!env.userId;

  // Preferencias y gustos de ESTA persona (nunca de otra): sólo con sesión.
  let prefs: PrefInput | null = null;
  let fit: Fit = { source: "none", criteria: [], ratio: null, verdict: "unknown" };
  if (env.userId) {
    const [user, taste] = await Promise.all([User.findById(env.userId).select("preferences").lean(), getTasteProfile(env.userId)]);
    prefs = (user?.preferences ?? null) as PrefInput | null;
    fit = matchPreferences(
      {
        operation: facts.operation,
        type: facts.type,
        neighborhood: facts.neighborhood,
        city: facts.city,
        price: { amount: facts.price.amount, currency: facts.price.currency },
        rooms: facts.rooms,
        bedrooms: facts.bedrooms,
        amenities: facts.amenities,
      },
      prefs,
      taste
    );
  }

  const { sentence, block } = verdictOf(fit, facts, signedIn, env.seed);

  const marks = highlights(facts);
  const intro = describeLine(facts);
  const extras = marks.length > 0 ? pick([`Destaca por ${list(marks)}.`, `Lo más llamativo: ${list(marks)}.`, `Tiene ${list(marks)}.`], env.seed) : "";
  const excerpt = firstSentences(facts.description);

  const blocks: AdvisorBlock[] = [{ type: "facts", title: "Lo esencial", items: factItems(facts) }];
  if (excerpt) blocks.push({ type: "text", text: `Así la presenta ${facts.agencyName ?? "la inmobiliaria"}: ${quote(excerpt, 150)}` });
  blocks.push(block);

  return {
    lead: [intro, extras, sentence].filter(Boolean).join(" "),
    blocks,
    followUps: followUpsFor(facts, signedIn),
    // Los botones ("Iniciar sesión", "Ajustar mis preferencias") ya van dentro del bloque del veredicto: no se repiten abajo.
    actions: [],
    resultIds: [facts.id],
    focusPropertyId: facts.id,
    mood: "neutral",
  };
};
