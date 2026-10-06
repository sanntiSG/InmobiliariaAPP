/** Etapas de un lead, en orden: nuevo → contactado → visita solicitada → visita realizada → oferta → cerrado. */
export const LEAD_STATUSES = [
  "nuevo",
  "contactado",
  "visita_solicitada",
  "visita_realizada",
  "oferta",
  "cerrado",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  visita_solicitada: "Visita solicitada",
  visita_realizada: "Visita realizada",
  oferta: "Oferta",
  cerrado: "Cerrado",
};

const HOUR_MS = 60 * 60 * 1000;
/** Un lead "nuevo" sin atender pasado este tiempo cuenta como sin seguimiento. */
export const NEW_LEAD_MAX_WAIT_MS = 24 * HOUR_MS;
/** Un lead abierto sin ningún contacto en este tiempo cuenta como sin seguimiento. */
export const OPEN_LEAD_MAX_SILENCE_MS = 7 * 24 * HOUR_MS;

/**
 * Banderas que implica estar en una etapa: pasar a "visita realizada" supone
 * que la visita se pidió, y "oferta" que ya hubo visita.
 */
export function flagsForStatus(status: LeadStatus) {
  const index = LEAD_STATUSES.indexOf(status);
  return {
    visitRequested: index >= LEAD_STATUSES.indexOf("visita_solicitada"),
    visitDone: index >= LEAD_STATUSES.indexOf("visita_realizada"),
    offerMade: index >= LEAD_STATUSES.indexOf("oferta"),
  };
}

/**
 * ¿Lleva demasiado tiempo sin seguimiento? Regla única, usada por el tablero
 * de clientes, el centro de oportunidades y las alertas del admin.
 */
export function isLeadStale(
  lead: { status: string; createdAt: Date | string; lastContactAt?: Date | string | null },
  now = Date.now()
): boolean {
  if (lead.status === "cerrado") return false;
  const created = new Date(lead.createdAt).getTime();
  if (lead.status === "nuevo") return now - created > NEW_LEAD_MAX_WAIT_MS;
  const last = lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : created;
  return now - last > OPEN_LEAD_MAX_SILENCE_MS;
}
