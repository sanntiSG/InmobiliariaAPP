/**
 * El vocabulario del panel, en un solo lugar: cada número tiene un nombre y una explicación en palabras de todos los días,
 * y los puntajes y las tasas se cuentan como se hablan ("de cada 100 visitas, 5 la guardan"). Sin jerga: nada de "pts",
 * "conversión" ni "embudo".
 */
export const GLOSSARY = {
  views: { label: "Visitas", help: "Veces que se abrió la ficha de una propiedad." },
  uniqueViews: { label: "Personas distintas", help: "Cuántas personas diferentes miraron tus propiedades (una persona que vuelve cuenta una vez)." },
  saves: { label: "Favoritos", help: "Personas que guardaron una propiedad para verla después." },
  likes: { label: "Me gusta", help: "Personas que marcaron una propiedad con un me gusta." },
  inquiries: { label: "Consultas", help: "Mensajes y contactos de personas interesadas en una propiedad." },
  shares: { label: "Compartidas", help: "Veces que alguien compartió una propiedad con otra persona." },
  tourOpens: { label: "Recorridos 360° abiertos", help: "Veces que alguien entró a recorrer una propiedad en 360°." },
  dwell: { label: "Tiempo mirando la ficha", help: "Cuánto se quedan, en promedio, leyendo una ficha." },
  published: { label: "Propiedades publicadas", help: "Las que hoy se ven en el mapa y en el listado." },
  staleClients: { label: "Clientes sin seguimiento", help: "Consultas que todavía no atendiste y se están enfriando." },
} as const;

/** "Interés alto/medio/bajo" en lugar de un puntaje suelto: la suma de visitas, favoritos, consultas y demás interacciones de los últimos 30 días. */
export function interestBand(score: number): "alto" | "medio" | "bajo" {
  return score >= 120 ? "alto" : score >= 30 ? "medio" : "bajo";
}
export const interestText = (score: number): string => `Interés ${interestBand(score)}`;

/** Una proporción contada como se habla: 0,05 → "5 de cada 100". */
export function perHundred(ratio: number | null | undefined): string | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  const n = ratio * 100;
  const text = n < 10 && n > 0 ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n) : String(Math.round(n));
  return `${text} de cada 100`;
}
