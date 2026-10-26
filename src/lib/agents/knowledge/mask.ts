/**
 * Saca de un texto lo que podría identificar a alguien antes de guardarlo o compararlo: emails, links, teléfonos o números largos
 * y usuarios (@algo). Lo usan las preguntas no entendidas del asesor y las lecciones de los agentes. Puro.
 */
export function maskPersonalData(raw: string, max: number): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\S+@\S+\.\S+/g, "[email]")
    .replace(/@\w+/g, "[usuario]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
