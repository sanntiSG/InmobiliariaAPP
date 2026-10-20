/**
 * Normalización del texto de la pregunta: minúsculas, sin tildes, números y
 * dinero en lenguaje cotidiano ("120 mil", "u$s 85.000", "5 por ciento", "tres
 * ambientes") llevados a una forma uniforme. Todo es determinístico y sin
 * dependencias — y se usa tanto para la pregunta como para armar los índices
 * (zonas, títulos), así los dos lados comparan texto normalizado igual.
 */

// Rango de marcas diacríticas construido desde code points (evita problemas de encoding con literales).
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(DIACRITICS, "");
}

const NUMBER_WORDS: Record<string, number> = {
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  veinte: 20,
  treinta: 30,
};

/** Las palabras que se convierten a número sólo si NO son parte de una frase fija ("tres" en "por tres razones" no importa). */
function numberWordsToDigits(text: string): string {
  return text.replace(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta)\b/g, (w) =>
    String(NUMBER_WORDS[w])
  );
}

function toNumber(raw: string): number {
  return Number.parseFloat(raw);
}

/**
 * Pasa a minúsculas sin tildes y unifica monedas, separadores, "mil/k/millones",
 * porcentajes y números escritos con letras. Devuelve texto con tokens
 * `[a-z0-9%.]` separados por un espacio.
 */
export function normalizeText(raw: string): string {
  let t = stripAccents(raw.toLowerCase()).replace(/²/g, "2");

  // Monedas: u$s / us$ / usd / dólares → "usd"; $ / pesos / ars → "ars".
  t = t
    .replace(/\bu\$s\b|\bus\$|\bu\$d\b|\bus\$d\b/g, " usd ")
    .replace(/\bdolar(?:es)?\b|\bdls\b|\bdolarizad[oa]s?\b/g, " usd ")
    .replace(/\$/g, " ars ")
    .replace(/\bpesos?\b|\bars\b/g, " ars ");

  // Separador de miles con punto (120.000 / 1.250.000) y coma decimal (1,5).
  t = t.replace(/\b(\d{1,3})((?:\.\d{3})+)\b/g, (_m, head: string, rest: string) => head + rest.replace(/\./g, ""));
  t = t.replace(/(\d),(\d)/g, "$1.$2");

  // "medio millón", "1,5 millones", "120 mil", "120k".
  t = t.replace(/\bmedio millon\b/g, "500000");
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:millones|millon)\b/g, (_m, n: string) => String(Math.round(toNumber(n) * 1_000_000)));
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:mil|k)\b/g, (_m, n: string) => String(Math.round(toNumber(n) * 1_000)));

  // Porcentajes: "5 %", "5 por ciento".
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:%|por ?ciento)/g, "$1% ");

  t = numberWordsToDigits(t);

  // Sólo letras, números, % y el punto decimal; el resto separa tokens.
  t = t.replace(/[^a-z0-9%.\s]/g, " ");
  // Un punto que no está entre dos dígitos es puntuación.
  t = t.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Palabras vacías: no aportan a la similitud entre frases. */
export const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en", "con", "por", "para", "que",
  "mi", "mis", "tu", "tus", "su", "sus", "me", "te", "se", "lo", "le", "les", "nos", "es", "son", "esta", "estan",
  "hay", "como", "cual", "cuales", "cuanto", "cuantos", "cuantas", "o", "u", "e", "ni", "si", "no", "mas", "muy",
  "tengo", "tenes", "tiene", "tienen", "ser", "estoy", "estamos", "he", "ha", "han", "pero", "ya", "sobre", "entre",
  "desde", "hasta", "sin", "este", "ese", "eso", "esto", "esos", "esas", "estos", "estas", "quiero", "podes", "puedo",
  "podria", "podrias", "favor", "porfa", "por", "favor", "che", "hola",
]);

/**
 * Stemmer liviano para español: pasa plurales, género y terminaciones verbales
 * comunes a una raíz estable ("propiedades"→"propiedad", "visitas"→"visit",
 * "bajaron"→"baj"). No pretende ser lingüísticamente perfecto: sólo que
 * la pregunta y el vocabulario converjan al mismo token.
 */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  let s = token;
  s = s.replace(/(?:aciones|iciones|uciones)$/, "ion").replace(/(?:ciones|siones)$/, "ion");
  if (s.length > 6) s = s.replace(/(?:aron|ieron|ando|iendo|ados|idos|adas|idas)$/, "");
  if (s.length > 5) s = s.replace(/(?:ado|ido|ada|ida)$/, "");
  s = s.replace(/ces$/, "z");
  if (s.length > 4 && /(?:[^aeiou]es)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
  if (s.length > 5 && /(?:ar|er|ir)$/.test(s)) s = s.slice(0, -2);
  else if (s.length >= 5 && /[aeo]$/.test(s)) s = s.slice(0, -1);
  return s;
}

export function contentTokens(normalized: string): string[] {
  return tokenize(normalized).filter((t) => !STOPWORDS.has(t));
}

/** Tokens de contenido ya con raíz: base de la similitud con frases de ejemplo y de los índices. */
export function stems(normalized: string): string[] {
  return contentTokens(normalized).map(stem);
}
