/**
 * Medición del efecto de un cambio: compara los días anteriores y posteriores
 * a la edición, y contra el resto de la cartera en las MISMAS fechas (grupo de
 * control) para no confundir un cambio de la propiedad con un cambio general
 * (fin de semana largo, estacionalidad). Si los datos no alcanzan, lo dice.
 */
import { consultas, getTotalsInRange, type Totals } from "@/lib/intelligence/metrics";
import { dayStart } from "@/lib/tracking/record";
import { change } from "../../compose/format";
import { DAYS } from "../../data/periods";
import type { PropertyRow } from "../../data/portfolio";
import type { AgencyEnv } from "../types";

/** Mínimos para poder hablar de un efecto sin inventarlo. */
export const IMPACT_MIN_DAYS = 3;
export const IMPACT_MIN_VIEWS = 10;
const MAX_WINDOW = 14;

export type Rates = { views: number; consultas: number; saves: number };

export type ImpactResult = {
  at: Date;
  beforeDays: number;
  afterDays: number;
  before: Rates;
  after: Rates;
  /** Variación de la tasa diaria de la propiedad (%). */
  delta: { views: number | null; consultas: number | null; saves: number | null };
  /** Variación de la tasa diaria de visitas del resto de la cartera en las mismas fechas (%). */
  controlViews: number | null;
  sufficient: boolean;
  /** Por qué no alcanza, para decírselo al usuario. */
  reason?: string;
};

const totalsOf = (t: Totals | undefined): Rates => ({ views: t?.views ?? 0, consultas: t ? consultas(t) : 0, saves: t?.saves ?? 0 });
const perDay = (r: Rates, days: number): Rates => ({ views: r.views / days, consultas: r.consultas / days, saves: r.saves / days });

export async function measureImpact(env: AgencyEnv, row: PropertyRow, at: Date): Promise<ImpactResult> {
  const changeDay = dayStart(at).getTime();
  const today = dayStart(env.now).getTime();
  const afterStart = changeDay + DAYS;
  const afterDays = Math.min(MAX_WINDOW, Math.floor((today - afterStart) / DAYS));

  const empty: ImpactResult = {
    at,
    beforeDays: 0,
    afterDays: Math.max(0, afterDays),
    before: { views: 0, consultas: 0, saves: 0 },
    after: { views: 0, consultas: 0, saves: 0 },
    delta: { views: null, consultas: null, saves: null },
    controlViews: null,
    sufficient: false,
  };

  if (afterDays < IMPACT_MIN_DAYS) {
    return { ...empty, reason: `pasaron sólo ${Math.max(0, afterDays)} días completos desde el cambio y necesito al menos ${IMPACT_MIN_DAYS} para medir algo` };
  }

  // Si la propiedad se publicó poco antes del cambio, la ventana previa es más corta (se comparan tasas por día).
  const published = row.publishedAt ? dayStart(row.publishedAt).getTime() : changeDay - MAX_WINDOW * DAYS;
  const beforeDays = Math.min(afterDays, Math.floor((changeDay - Math.max(published, changeDay - MAX_WINDOW * DAYS)) / DAYS));
  if (beforeDays < IMPACT_MIN_DAYS) {
    return { ...empty, afterDays, reason: `la propiedad llevaba menos de ${IMPACT_MIN_DAYS} días publicada cuando hiciste el cambio, así que no hay un "antes" para comparar` };
  }

  const beforeFrom = new Date(changeDay - beforeDays * DAYS);
  const beforeTo = new Date(changeDay);
  const afterFrom = new Date(afterStart);
  const afterTo = new Date(afterStart + afterDays * DAYS);

  const [bProp, aProp, bAll, aAll] = await Promise.all([
    getTotalsInRange({ propertyIds: [row.id] }, beforeFrom, beforeTo),
    getTotalsInRange({ propertyIds: [row.id] }, afterFrom, afterTo),
    getTotalsInRange({ agencyId: row.agencyId }, beforeFrom, beforeTo),
    getTotalsInRange({ agencyId: row.agencyId }, afterFrom, afterTo),
  ]);

  const before = totalsOf(bProp.get(row.id));
  const after = totalsOf(aProp.get(row.id));
  const bPd = perDay(before, beforeDays);
  const aPd = perDay(after, afterDays);

  // Control: el resto de la cartera de la inmobiliaria en las mismas fechas.
  const sumViews = (m: Map<string, Totals>) => [...m].filter(([id]) => id !== row.id).reduce((a, [, t]) => a + t.views, 0);
  const cb = sumViews(bAll) / beforeDays;
  const ca = sumViews(aAll) / afterDays;

  const result: ImpactResult = {
    at,
    beforeDays,
    afterDays,
    before: bPd,
    after: aPd,
    delta: {
      views: change(aPd.views, bPd.views),
      consultas: change(aPd.consultas, bPd.consultas),
      saves: change(aPd.saves, bPd.saves),
    },
    controlViews: cb > 0 ? change(ca, cb) : null,
    sufficient: before.views >= IMPACT_MIN_VIEWS,
  };
  if (!result.sufficient) result.reason = `antes del cambio la propiedad tenía menos de ${IMPACT_MIN_VIEWS} visitas en ese tramo, un número muy chico para comparar`;
  return result;
}
