/**
 * Portada viva: qué propiedades la tienen, cuáles no y dónde convendría probarla. La portada viva es un servicio aparte
 * (el proveedor prepara la carpeta), así que el asesor la ofrece con criterio: sólo pone adelante las de más visitas y
 * dice con claridad que lo que muestra no prueba que la portada sea la causa de nada.
 */
import { consultas } from "@/lib/intelligence/metrics";
import { phrase } from "@/lib/agents/knowledge/phrasing";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { count, n0, plural } from "../../compose/format";
import type { AdvisorBlock } from "../../types";
import type { AgencyHandler } from "../types";
import { MIN_VIEWS, editHref, filterRows, propRef } from "./shared";
import type { PropertyRow } from "../../data/portfolio";

const SHOW = 4;

const WHAT_IT_IS =
  "La portada viva muestra la misma foto de día, al atardecer, de noche, con lluvia y con viento. Es un servicio aparte: pedile la carpeta al proveedor y cargala en «Portada» al editar la propiedad.";

const avg = (rows: PropertyRow[], f: (r: PropertyRow) => number) => (rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : 0);

export const ambientCover: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const pool = filterRows(p.rows, env.slots);

  if (pool.length === 0) {
    return {
      lead: phrase(
        "agency.ambient.nopool",
        ["No tenés propiedades publicadas (con esos filtros) para revisar la portada viva.", "Con esos filtros no hay propiedades publicadas en las que revisar la portada viva."],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.overview", "Dame un resumen general")]),
    };
  }

  const withIt = pool.filter((r) => r.hasAmbientCover).sort((a, b) => b.d30.views - a.d30.views);
  const without = pool.filter((r) => !r.hasAmbientCover).sort((a, b) => b.d30.views - a.d30.views || b.score - a.score);
  const first = without[0];
  const blocks: AdvisorBlock[] = [];

  // Con tráfico medido: ahí se aprovecharía más; sin tráfico, no se afirma nada.
  const candidates = without.filter((r) => r.d30.views >= MIN_VIEWS).slice(0, 3);

  if (withIt.length === 0) {
    if (candidates.length > 0) {
      blocks.push({
        type: "properties",
        title: "Las que más visitas reciben",
        items: candidates.map((r) =>
          propRef(r, env, {
            chips: [`${n0(r.d30.views)} ${plural(r.d30.views, "visita", "visitas")}`, `${n0(consultas(r.d30))} ${plural(consultas(r.d30), "consulta", "consultas")}`],
            note: "Recibe tráfico: es una buena candidata para probar la portada viva.",
            auto: false,
          })
        ),
      });
    } else {
      blocks.push({ type: "caveat", text: "Todavía hay pocas visitas medidas, así que no puedo decirte en cuál de tus propiedades rendiría más." });
    }
    return {
      lead: `Ninguna de tus ${count(pool.length, "propiedad publicada", "propiedades publicadas")} tiene portada viva todavía. ${WHAT_IT_IS}`,
      blocks,
      followUps: dedupeSuggestions([sug("agency.opportunities", "¿Qué otras oportunidades hay?"), sug("agency.promote", "¿Cuáles conviene promocionar?")]),
      actions: first ? [{ label: `Editar «${first.title.slice(0, 28)}»`, href: editHref(first), kind: "primary" as const }] : undefined,
      resultIds: candidates.map((r) => r.id),
      focusPropertyId: candidates[0]?.id,
    };
  }

  blocks.push({
    type: "properties",
    title: "Con portada viva",
    items: withIt.slice(0, SHOW).map((r) =>
      propRef(r, env, {
        chips: [`${n0(r.d30.views)} ${plural(r.d30.views, "visita", "visitas")}`, `${n0(r.d30.saves)} ${plural(r.d30.saves, "favorito", "favoritos")}`],
        tone: "good",
        auto: false,
      })
    ),
  });

  // Comparación sólo si hay con qué comparar y algo de tráfico: con tres propiedades no se prueba nada.
  const compare = without.length > 0 && withIt.length + without.length >= 4 && pool.reduce((s, r) => s + r.d30.views, 0) >= MIN_VIEWS;
  if (compare) {
    const row = (factor: string, f: (r: PropertyRow) => number, digits = 0) => ({
      factor,
      top: { text: avg(withIt, f).toFixed(digits).replace(".", ","), tone: "neutral" as const },
      rest: avg(without, f).toFixed(digits).replace(".", ","),
    });
    blocks.push({
      type: "table",
      caption: "Promedio por propiedad, últimos 30 días",
      columns: [
        { key: "factor", label: "" },
        { key: "top", label: "Con portada viva", align: "right" },
        { key: "rest", label: "Sin portada viva", align: "right" },
      ],
      rows: [row("Visitas", (r) => r.d30.views), row("Favoritos", (r) => r.d30.saves), row("Consultas", (r) => consultas(r.d30))],
    });
  }

  if (without.length > 0) {
    blocks.push({
      type: "properties",
      title: "Sin portada viva (las de más visitas primero)",
      items: without.slice(0, SHOW).map((r) =>
        propRef(r, env, {
          chips: [`${n0(r.d30.views)} ${plural(r.d30.views, "visita", "visitas")}`],
          auto: false,
        })
      ),
    });
  }
  blocks.push({
    type: "caveat",
    text: "Son promedios de pocas propiedades y cada una tiene su zona, su precio y su momento: no prueban que la portada viva sea la causa de la diferencia.",
  });

  return {
    lead:
      without.length === 0
        ? `Todas tus ${count(pool.length, "propiedad publicada", "propiedades publicadas")} tienen portada viva.`
        : `${withIt.length} de tus ${count(pool.length, "propiedad publicada", "propiedades publicadas")} ${withIt.length === 1 ? "tiene" : "tienen"} portada viva; ${without.length} todavía no.${first && first.d30.views >= MIN_VIEWS ? ` La que más visitas recibe sin ella es ${first.title}.` : ""}`,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.change_impact", "¿Sirvió agregar la portada viva?", { slots: { field: "ambient" } }),
      sug("agency.opportunities", "¿Qué otras oportunidades hay?"),
    ]),
    actions: first ? [{ label: `Editar «${first.title.slice(0, 28)}»`, href: editHref(first), kind: "primary" as const }] : undefined,
    resultIds: [...withIt, ...without].slice(0, 6).map((r) => r.id),
    focusPropertyId: (first ?? withIt[0])?.id,
  };
};
