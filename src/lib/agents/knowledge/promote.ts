/**
 * Qué propiedad conviene promocionar: puntaje y motivos con las mismas reglas para todos los agentes. El asesor lo usa para
 * contestar "¿qué promociono?" y el de marketing para recomendar qué publicar en redes. Función pura sobre las filas que ya
 * arma el portfolio (sin base de datos), así se prueba con datos de mentira.
 */
import { benchFor, type Benchmarks } from "@/lib/intelligence/benchmarks";
import { THRESHOLDS } from "@/lib/intelligence/diagnostics";
import { consultas, ratio } from "@/lib/intelligence/metrics";
import { change, n0, pct, signedPct } from "@/lib/advisor/compose/format";
import type { PropertyRow } from "@/lib/advisor/data/portfolio";

const DAY_MS = 86_400_000;

/** Con menos visitas que esto en 30 días no se habla de "interés sostenido" (igual que el resto del asesor). */
export const PROMOTE_MIN_VIEWS = THRESHOLDS.minViewsForRates;

export type PromotionRow = Pick<
  PropertyRow,
  "id" | "type" | "operation" | "score" | "d30" | "w7" | "p7" | "hasTour" | "videos" | "hasAmbientCover" | "publishedAt" | "images" | "descriptionLength" | "diagnostics"
>;

export type Promotion<T extends PromotionRow = PromotionRow> = {
  r: T;
  score: number;
  /** Motivos en lenguaje natural, sin mayúscula inicial ni punto: "recibe interés sostenido (45 visitas en 30 días)". */
  reasons: string[];
  /** Bien presentada: fotos y descripción suficientes. */
  ready: boolean;
  /** No conviene empujarla todavía: muy pocas fotos o un problema grave pendiente. */
  blocked: boolean;
};

export type PromoteOptions = {
  /** Cuántos días atrás se promocionó cada propiedad (las de los últimos 3 días bajan puntos, para no repetir). */
  promotedDaysAgo?: ReadonlyMap<string, number>;
};

/** Ordena las propiedades de mejor a peor candidata a promocionar. */
export function rankForPromotion<T extends PromotionRow>(rows: readonly T[], bench: Benchmarks, now: Date, opts: PromoteOptions = {}): Promotion<T>[] {
  return rows
    .map((r) => {
      const b = benchFor(bench, r.type, r.operation);
      const reasons: string[] = [];
      let score = r.score * 0.5;
      const rate = ratio(consultas(r.d30), r.d30.views);
      if (r.d30.views >= PROMOTE_MIN_VIEWS) {
        reasons.push(`recibe interés sostenido (${n0(r.d30.views)} visitas en 30 días)`);
        if (rate != null && b.inquiryRate != null && rate >= b.inquiryRate) {
          score += 10;
          reasons.push(`convierte mejor que propiedades similares (${pct(rate, { fromRatio: true })} de consulta)`);
        }
      }
      const rising = change(r.w7.views, r.p7.views);
      if (rising != null && r.w7.views >= 15 && r.p7.views >= 5 && rising >= THRESHOLDS.risingGrowthPct) {
        score += 8;
        reasons.push(`sus visitas crecieron ${signedPct(rising, 0)} esta semana`);
      }
      if (r.hasTour) {
        score += 4;
        reasons.push("tiene recorrido 360°, que la diferencia");
      }
      if (r.videos > 0) score += 2;
      if (r.hasAmbientCover) {
        score += 3;
        reasons.push("tiene portada viva, con la que se destaca");
      }
      const isNew = r.publishedAt && now.getTime() - r.publishedAt.getTime() <= 14 * DAY_MS;
      if (isNew) {
        score += 4;
        reasons.push("es una novedad reciente");
      }
      const ready = r.images >= THRESHOLDS.minImages && r.descriptionLength >= 100;
      if (ready) score += 3;
      const promoted = opts.promotedDaysAgo?.get(r.id);
      if (promoted != null && promoted <= 3) score -= 6;
      const blocked = r.images < 3 || r.diagnostics.some((d) => d.kind === "attention" && d.severity === "high");
      return { r, score, reasons, ready, blocked };
    })
    .sort((a, b) => b.score - a.score);
}

/** "Recibe interés sostenido (45 visitas en 30 días) y tiene recorrido 360°, que la diferencia." */
export function promotionNote(reasons: readonly string[]): string {
  if (reasons.length === 0) return "Está bien presentada y lista para difundir.";
  const first = `${reasons[0]!.charAt(0).toUpperCase()}${reasons[0]!.slice(1)}`;
  return `${first}${reasons[1] ? ` y ${reasons[1]}` : ""}.`;
}
