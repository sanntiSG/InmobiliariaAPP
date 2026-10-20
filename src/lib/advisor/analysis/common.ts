import { INTENT_LABELS, defaultSuggestions } from "../compose/labels";
import { pick } from "../compose/format";
import { sug } from "../compose/suggest";
import type { Env, HandlerResult } from "./types";

export function greeting(env: Env): HandlerResult {
  const name = env.persona.name;
  const lead =
    env.mode === "agency"
      ? pick(
          [
            `¡Hola! Soy ${name}. Miro tus propiedades, tus visitas y lo que vas cambiando, y te cuento qué está pasando y qué conviene hacer.`,
            `¡Hola! Acá ${name}. Preguntame lo que quieras de tus publicaciones: cómo vienen, qué cambió, qué mejorar.`,
          ],
          env.seed
        )
      : pick(
          [
            `¡Hola! Soy ${name}. Te ayudo a encontrar propiedades según lo que buscás, a comparar precios y a ver qué se mueve en el mercado.`,
            `¡Hola! Acá ${name}. Contame qué tipo de propiedad buscás, en qué zona y hasta qué precio, y te muestro opciones.`,
          ],
          env.seed
        );
  return { lead, blocks: [], followUps: defaultSuggestions(env.mode) };
}

export function thanks(env: Env): HandlerResult {
  return {
    lead: pick(["¡De nada! Si querés seguimos con otra cosa.", "Un gusto. Cuando quieras, seguimos.", "¡Dale! Acá estoy para lo que necesites."], env.seed),
    blocks: [],
    followUps: defaultSuggestions(env.mode).slice(0, 4),
  };
}

export function help(env: Env): HandlerResult {
  if (env.mode === "agency") {
    return {
      lead: "Puedo analizar tu negocio con los datos reales de la plataforma. Por ejemplo: qué propiedades rinden peor o mejor, cuáles tienen visitas pero pocas consultas y por qué, qué cambió respecto de la semana o el mes pasado, comparar zonas y tipos de propiedad, qué publicaciones están incompletas, simular un cambio de precio, medir si un cambio que hiciste funcionó y proponerte las acciones que más conviene hacer. Y siempre te digo cuando los datos no alcanzan para afirmar algo.",
      blocks: [],
      followUps: [
        "agency.overview",
        "agency.worst",
        "agency.views_no_inquiries",
        "agency.compare_zones",
        "agency.change_impact",
        "agency.actions",
      ].map((id) => sug(id as never, INTENT_LABELS[id as keyof typeof INTENT_LABELS])),
    };
  }
  return {
    lead: "Te ayudo a explorar propiedades: buscar con tus palabras (“departamento de 2 ambientes en Palermo hasta 120 mil dólares con cochera”), recomendarte según lo que te gusta, mostrar las que bajaron de precio, decirte cuánto cuesta una zona, comparar propiedades y ver si una está bien de precio.",
    blocks: [],
    followUps: defaultSuggestions("explorer"),
  };
}
