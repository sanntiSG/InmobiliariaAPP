// Rango Unicode de marcas diacríticas combinantes (U+0300–U+036F), construido
// desde los code points para evitar problemas de encoding con literales.
const DIACRITICS_REGEX = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

/** Convierte texto libre en un slug URL-safe (minúsculas, sin acentos, guiones). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Genera un slug único agregando un sufijo corto (para colisiones). */
export function uniqueSlug(input: string, suffixSource: string): string {
  const base = slugify(input);
  const suffix = suffixSource.slice(-6);
  return `${base}-${suffix}`;
}
