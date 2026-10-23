/**
 * Regresión de la portada viva — sin base de datos ni red. Arma carpetas sintéticas (una válida y varias rotas, de
 * a una falla por vez) y comprueba que la validación las acepta o las rechaza con el código correcto. Si existe la
 * carpeta de muestra `1/` (la que entrega el proveedor) también la valida entera. Correr con `npm run ambient:check`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  AmbientValidationError,
  normalizeEntryPath,
  parseManifestText,
  referencedFiles,
  sanitizeManifest,
  validateFolder,
  type AmbientIssueCode,
  type FolderEntry,
} from "../src/lib/ambient/validate";
import { AMBIENT_DISCLOSURE } from "../src/lib/ambient/constants";
import { resolveStartState } from "../src/lib/ambient/start-state";
import { validateManifest } from "../src/vendor/ambient/ambient-manifest";
import type { AmbientAsset, AmbientManifest } from "../src/vendor/ambient";
import { diffProperty, snapshotProperty } from "../src/lib/activity/diff";
import { ambientCover } from "../src/lib/advisor/analysis/agency/ambient";
import type { AgencyEnv } from "../src/lib/advisor/analysis/types";
import { describeChange } from "../src/lib/advisor/compose/activity-text";
import type { PropertyRow } from "../src/lib/advisor/data/portfolio";
import { toPropertyCardData } from "../src/lib/db/property-card-mapper";
import { diagnoseProperty, type DiagnosticProperty } from "../src/lib/intelligence/diagnostics";
import type { Bench } from "../src/lib/intelligence/benchmarks";
import { emptyTotals, type PropertyMetrics } from "../src/lib/intelligence/metrics";

// ── Carpeta sintética ────────────────────────────────────────────────────────────────────────────────────────

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function webpBytes(seed: number, size = 400): Uint8Array {
  const b = new Uint8Array(size).map((_, i) => (seed * 31 + i * 7) & 255);
  b.set([0x52, 0x49, 0x46, 0x46, size & 255, (size >> 8) & 255, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return b;
}
function avifBytes(seed: number, size = 400): Uint8Array {
  const b = new Uint8Array(size).map((_, i) => (seed * 17 + i * 5) & 255);
  b.set([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  return b;
}
const pngBytes = (size = 400) => {
  const b = new Uint8Array(size).fill(9);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};

type Built = { files: Map<string, Uint8Array>; manifest: AmbientManifest };

function build(): Built {
  const files = new Map<string, Uint8Array>();
  let seed = 1;
  const make = (base: string, variant: "desktop" | "mobile", ext: "webp" | "avif", bytes?: Uint8Array): AmbientAsset => {
    const data = bytes ?? (ext === "webp" ? webpBytes(seed++) : avifBytes(seed++));
    const name = `${base}.${variant}.${sha(data).slice(0, 12)}.${ext}`;
    files.set(name, data);
    const [width, height] = variant === "desktop" ? [1600, 840] : [960, 504];
    return { file: name, bytes: data.length, sha256: sha(data), width, height };
  };
  const both = (base: string, ext: "webp" | "avif") => ({ desktop: make(base, "desktop", ext), mobile: make(base, "mobile", ext) });
  const plates = (base: string) => ({ desktop: { avif: make(base, "desktop", "avif"), webp: make(base, "desktop", "webp") }, mobile: { avif: make(base, "mobile", "avif"), webp: make(base, "mobile", "webp") } });
  const params = { cloudSpeed: 0.5, cloudMod: 0.1, wind: 0.3, gust: 0.1, rain: 0, wetness: 0, lightsOn: 0, stars: 0 };

  const day = plates("plate");
  const state = (id: string, label: string, p: ReturnType<typeof plates>, extra: Record<string, number> = {}) => ({ id, label, plates: p, params: { ...params, ...extra } });
  const manifest: AmbientManifest = {
    schemaVersion: 1,
    propertyId: "1",
    disclosure: "texto cualquiera que el servidor debe pisar",
    aspect: [1600, 840],
    focus: [0.5, 0.5],
    initialState: "day",
    transitionMs: 2400,
    variants: { desktop: { width: 1600, height: 840 }, mobile: { width: 960, height: 504 } },
    formats: ["avif", "webp"],
    layers: { masks: both("masks", "webp"), lights: both("lights", "webp"), lightOrder: both("order", "webp") },
    states: [
      state("day", "Día", day),
      state("dusk", "Atardecer", plates("plate")),
      state("night", "Noche", plates("plate"), { lightsOn: 1, stars: 1 }),
      state("rain", "Lluvia", plates("plate"), { rain: 1, wetness: 1 }),
      state("wind", "Viento", day, { gust: 0.4 }), // comparte imágenes con "día", como la carpeta real
    ],
  };
  return { files, manifest };
}

const entryOf = (p: string, data: Uint8Array): FolderEntry => ({ path: p, size: data.length, read: async () => data });
const textOf = (s: string) => new TextEncoder().encode(s);

function entriesOf(b: Built, prefix = "ambient/1/", manifestText = JSON.stringify(b.manifest)): FolderEntry[] {
  return [...[...b.files].map(([n, d]) => entryOf(prefix + n, d)), entryOf(`${prefix}experience.json`, textOf(manifestText))];
}

/** Copia del manifest con una modificación puntual (para armar una falla por vez). */
function tweak(b: Built, change: (m: Record<string, unknown>) => void): string {
  const m = structuredClone(b.manifest) as unknown as Record<string, unknown>;
  change(m);
  return JSON.stringify(m);
}

// ── Mini-runner ──────────────────────────────────────────────────────────────────────────────────────────────

let failed = 0;
let total = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try {
    await fn();
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function rejects(code: AmbientIssueCode, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    assert(err instanceof AmbientValidationError, `se esperaba AmbientValidationError y salió ${String(err)}`);
    assert(err.code === code, `se esperaba "${code}" y salió "${err.code}" (${err.message})`);
    assert(err.message.length > 10 && !/Invalid experience manifest/.test(err.message), `mensaje no apto para mostrar: ${err.message}`);
    return;
  }
  throw new Error(`se esperaba el rechazo "${code}" y fue aceptada`);
}

async function main() {
  const good = build();

  await test("carpeta válida: se acepta y trae los 5 estados", async () => {
    const r = await validateFolder(entriesOf(good));
    assert(r.manifest.states.length === 5, "esperaba 5 estados");
    assert(r.refs.length === good.files.size, `refs ${r.refs.length} ≠ archivos ${good.files.size}`);
    assert(r.files.every((f) => f.sha256.length === 64), "falta algún sha256");
  });

  await test("las imágenes compartidas entre estados no se duplican (viento usa las de día)", () => {
    const names = referencedFiles(good.manifest).map((r) => r.name);
    assert(new Set(names).size === names.length, "hay archivos repetidos");
  });

  await test("ignora lo que no usa: vendor/, index.html, LEEME.txt y basura de macOS", async () => {
    const extra = [
      entryOf("1/index.html", textOf("<html>")),
      entryOf("1/LEEME.txt", textOf("hola")),
      entryOf("1/vendor/ambient/ambient-player.js", textOf("alert(1)")),
      entryOf("__MACOSX/ambient/1/._experience.json", textOf("basura")),
      entryOf("1/ambient/1/.DS_Store", textOf("x")),
    ];
    const r = await validateFolder([...extra, ...entriesOf(good, "1/ambient/1/")]);
    assert(r.files.length === good.files.size, "no debería haber agregado nada");
  });

  await test("sirve la carpeta suelta (sin subcarpetas) y con barras de Windows", async () => {
    await validateFolder(entriesOf(good, ""));
    await validateFolder(entriesOf(good, "ambient\\1\\"));
  });

  await rejectsCases(good);

  await test("sanitizeManifest: pisa el aviso, descarta campos de más y sigue pasando el validador del reproductor", () => {
    const dirty = structuredClone(good.manifest) as unknown as Record<string, unknown>;
    dirty.generator = { name: "x" };
    dirty.source = { sha256: "a" };
    dirty.title = "<img src=x onerror=alert(1)>";
    const clean = sanitizeManifest(parseManifestText(JSON.stringify(dirty)), "11111111-2222-4333-8444-555555555555");
    assert(clean.disclosure === AMBIENT_DISCLOSURE, "el aviso no se pisó");
    assert(!("generator" in clean) && !("source" in clean) && !("title" in clean), "quedaron campos de más");
    assert(clean.propertyId === "11111111-2222-4333-8444-555555555555", "propertyId");
    validateManifest(clean);
  });

  await test("normalizeEntryPath: rutas peligrosas o basura quedan vacías", () => {
    assert(normalizeEntryPath("../x/experience.json") === "", ".. debe descartarse");
    assert(normalizeEntryPath("a/../b") === "", ".. en el medio debe descartarse");
    assert(normalizeEntryPath("__MACOSX/a/b") === "", "__MACOSX");
    assert(normalizeEntryPath("./a//b\\c.webp") === "a/b/c.webp", "normalización");
  });

  await test("estado inicial según la hora (y cae al más parecido si falta alguno)", () => {
    const at = (h: number) => new Date(2026, 5, 15, h, 30);
    const all = ["day", "dusk", "night", "rain", "wind"];
    assert(resolveStartState(all, "auto", at(12)) === "day", "mediodía");
    assert(resolveStartState(all, "auto", at(19)) === "dusk", "19 h");
    assert(resolveStartState(all, "auto", at(23)) === "night", "23 h");
    assert(resolveStartState(all, "auto", at(3)) === "night", "3 h");
    assert(resolveStartState(["day", "rain"], "auto", at(23)) === "day", "sin noche ni atardecer → día");
    assert(resolveStartState(["day", "dusk"], "auto", at(23)) === "dusk", "sin noche → atardecer");
    assert(resolveStartState(["rain", "wind"], "auto", at(23)) === "rain", "sólo clima → el primero");
    assert(resolveStartState(all, "rain", at(12)) === "rain", "estado fijo");
    assert(resolveStartState(["day", "dusk"], "rain", at(12)) === "day", "fijo pero desactivado → según la hora");
  });

  await panelAndAdvisor();
  await realSample();

  console.log(`\n${total - failed}/${total} pruebas correctas`);
  process.exit(failed > 0 ? 1 : 0);
}

async function rejectsCases(good: Built) {
  const replace = (name: string, data: Uint8Array) => entriesOf(good).map((e) => (e.path.endsWith(name) ? entryOf(e.path, data) : e));
  const firstFile = (re: RegExp) => [...good.files.keys()].find((n) => re.test(n))!;

  await test("rechaza: sin experience.json", () => rejects("no-manifest", () => validateFolder(entriesOf(good).filter((e) => !e.path.endsWith("experience.json")))));
  await test("rechaza: dos experience.json", () => rejects("many-manifests", () => validateFolder([...entriesOf(good), ...entriesOf(good, "otra/")])));
  await test("rechaza: JSON roto", () => rejects("bad-json", () => validateFolder(entriesOf(good, "ambient/1/", "{ esto no es json"))));
  await test("rechaza: otra versión de esquema", () => rejects("bad-manifest", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => (m.schemaVersion = 2))))));
  await test("rechaza: parámetro de clima fuera de rango", () =>
    rejects("bad-manifest", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => ((m.states as { params: Record<string, number> }[])[0]!.params.rain = 7))))));
  await test("rechaza: nombre de archivo con ../ en el manifest", () =>
    rejects("bad-manifest", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => ((m.layers as { masks: { desktop: { file: string } } }).masks.desktop.file = "../masks.desktop.71699bbb99d9.webp"))))));
  await test("rechaza: id de estado raro", () =>
    rejects("bad-manifest", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => ((m.states as { id: string }[])[1]!.id = "Atardecer <b>"))))));
  await test("rechaza: sha256 mal escrito", () =>
    rejects("bad-manifest", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => ((m.layers as { masks: { desktop: { sha256: string } } }).masks.desktop.sha256 = "zzz"))))));
  await test("rechaza: falta una imagen (dice cuál)", async () => {
    const night = firstFile(/^plate\./);
    const entries = entriesOf(good).filter((e) => !e.path.endsWith(night));
    await rejects("missing-file", () => validateFolder(entries));
  });
  await test("rechaza: imagen alterada (mismo peso, otro contenido)", () => {
    const name = firstFile(/^masks\.desktop/);
    const tampered = new Uint8Array(good.files.get(name)!);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    return rejects("bad-hash", () => validateFolder(replace(name, tampered)));
  });
  await test("rechaza: imagen cortada (otro peso)", () => {
    const name = firstFile(/^masks\.desktop/);
    return rejects("bad-size", () => validateFolder(replace(name, good.files.get(name)!.slice(0, 100))));
  });
  await test("rechaza: un .png renombrado a .webp (aunque el manifest esté de acuerdo)", async () => {
    const fake = build();
    const name = [...fake.files.keys()].find((n) => /^masks\.desktop/.test(n))!;
    const png = pngBytes(fake.files.get(name)!.length);
    // el manifest declara el peso y el hash del PNG, así que sólo la firma real lo delata
    const text = tweak(fake, (m) => {
      const a = (m.layers as { masks: { desktop: AmbientAsset } }).masks.desktop;
      a.sha256 = sha(png);
    });
    const entries = entriesOf(fake, "ambient/1/", text).map((e) => (e.path.endsWith(name) ? entryOf(e.path, png) : e));
    await rejects("bad-type", () => validateFolder(entries));
  });
  await test("rechaza: una imagen que declara pesar más del tope", () =>
    rejects("too-big", () => validateFolder(entriesOf(good, "ambient/1/", tweak(good, (m) => ((m.layers as { masks: { desktop: { bytes: number } } }).masks.desktop.bytes = 5 * 1024 * 1024))))));
}

// ── Panel, asesor, tarjetas y bitácora (datos sintéticos, sin base) ─────────────────────────────────────────

function diagProp(over: Partial<DiagnosticProperty> = {}): DiagnosticProperty {
  return {
    id: "p1", title: "Casa de prueba", type: "casa", operation: "venta", publishedAt: new Date(Date.now() - 40 * 86_400_000), priceChangedAt: null,
    imageCount: 8, descriptionLength: 400, videoCount: 1, hasTour: true, hasAmbientCover: false, agencyUsesAmbient: false, hasArea: true, hasBedrooms: true,
    ...over,
  };
}
const metricsWith = (views: number) => ({ d30: { ...emptyTotals(), views }, w7: emptyTotals(), p7: emptyTotals() }) as unknown as PropertyMetrics;
const hasRule = (p: DiagnosticProperty, views: number) =>
  diagnoseProperty({ property: p, metrics: views ? metricsWith(views) : null, bench: {} as Bench, leads: null }).some((d) => d.id.startsWith("no-ambient-cover"));

function row(over: Partial<PropertyRow>): PropertyRow {
  const t = emptyTotals();
  return {
    id: "r", slug: "r", title: "Propiedad", status: "published", agencyId: "a", agencyName: null, type: "casa", operation: "venta", price: 100000, currency: "USD",
    period: "total", neighborhood: "Palermo", city: "CABA", bedrooms: 3, rooms: 4, area: 100, amenities: [], images: 8, descriptionLength: 400, videos: 1, hasTour: false,
    hasAmbientCover: false, scenes: 0, cover: null, publishedAt: new Date(), priceChangedAt: null, pricePerM2: 1000, w7: t, p7: t, d30: t, score: 0, diagnostics: [], place: "Palermo",
    ...over,
  };
}
function envOf(rows: PropertyRow[]): AgencyEnv {
  return {
    mode: "agency", scope: { agencyId: "a" }, isAdmin: false, userId: null, now: new Date(), slots: {}, context: { turn: 0 }, seed: 1, persona: { name: "Asesor" },
    portfolio: { scope: { agencyId: "a" }, rows, drafts: [], byId: new Map(rows.map((r) => [r.id, r])), intel: {}, bench: {}, activity: [], loadedAt: 0 },
  } as unknown as AgencyEnv;
}
const views = (n: number) => ({ ...emptyTotals(), views: n });

async function panelAndAdvisor() {
  await test("diagnóstico: no ofrece portada viva a quien no tiene tráfico ni la usa", () => {
    assert(!hasRule(diagProp(), 0), "no debería sugerirla sin tráfico");
    assert(!hasRule(diagProp(), 10), "con pocas visitas tampoco");
  });
  await test("diagnóstico: la ofrece con tráfico, o si la inmobiliaria ya la usa en otra propiedad", () => {
    assert(hasRule(diagProp(), 45), "con ≥30 visitas sí");
    assert(hasRule(diagProp({ agencyUsesAmbient: true }), 0), "si ya la usa en otra, sí");
  });
  await test("diagnóstico: nunca la ofrece a quien ya la tiene", () => {
    assert(!hasRule(diagProp({ hasAmbientCover: true, agencyUsesAmbient: true }), 80), "ya la tiene");
  });

  await test("asesor: ninguna la tiene → lo dice, explica que es un servicio aparte y señala la de más visitas", async () => {
    const rows = [row({ id: "a", title: "Casa A", d30: views(80) }), row({ id: "b", title: "Casa B", d30: views(5) })];
    const r = await ambientCover(envOf(rows));
    assert(/Ninguna/.test(r.lead) && /servicio aparte/.test(r.lead), `lead: ${r.lead}`);
    assert(r.blocks.some((b) => b.type === "properties"), "falta el bloque de candidatas");
    assert(r.actions?.[0]?.href.includes("/editar"), "falta la acción de editar");
    assert(r.resultIds?.[0] === "a", "la de más visitas va primera");
  });
  await test("asesor: sin tráfico no inventa candidatas", async () => {
    const r = await ambientCover(envOf([row({ id: "a" }), row({ id: "b" })]));
    assert(!r.blocks.some((b) => b.type === "properties"), "no debería listar candidatas sin visitas");
    assert(r.blocks.some((b) => b.type === "caveat"), "debería aclarar que hay pocas visitas");
  });
  await test("asesor: con algunas → cuenta cuántas, compara con aclaración y no promete causa", async () => {
    const rows = [
      row({ id: "a", title: "A", hasAmbientCover: true, d30: views(60) }), row({ id: "b", title: "B", hasAmbientCover: true, d30: views(40) }),
      row({ id: "c", title: "C", d30: views(20) }), row({ id: "d", title: "D", d30: views(10) }),
    ];
    const r = await ambientCover(envOf(rows));
    assert(/^2 de tus 4/.test(r.lead), `lead: ${r.lead}`);
    assert(r.blocks.some((b) => b.type === "table"), "falta la comparación");
    const caveat = r.blocks.find((b) => b.type === "caveat");
    assert(caveat && /no prueban/.test((caveat as { text: string }).text), "falta la aclaración de que no prueba causa");
  });
  await test("asesor: si todas la tienen, lo dice sin ofrecer nada más", async () => {
    const r = await ambientCover(envOf([row({ id: "a", hasAmbientCover: true }), row({ id: "b", hasAmbientCover: true })]));
    assert(/Todas/.test(r.lead), `lead: ${r.lead}`);
  });

  await test("tarjetas: con portada viva muestran el póster y la marca; sin ella, la primera foto", () => {
    const base = {
      _id: "x", slug: "x", title: "X", price: { amount: 1, currency: "USD", period: "total" }, operation: "venta", type: "casa",
      location: { coordinates: [-58.4, -34.6] }, address: { city: "CABA", showExact: true },
    };
    const withAmbient = toPropertyCardData({
      ...base, media: { images: [{ url: "https://x/foto.jpg", order: 0 }], hasAmbientCover: true, ambient: { poster: { url: "https://x/poster.jpg" } } },
    });
    assert(withAmbient.image === "https://x/poster.jpg" && withAmbient.ambient === true, "debería usar el póster");
    const plain = toPropertyCardData({ ...base, media: { images: [{ url: "https://x/foto.jpg", order: 0 }] } });
    assert(plain.image === "https://x/foto.jpg" && plain.ambient === false, "debería usar la foto");
    const flagOff = toPropertyCardData({ ...base, media: { images: [{ url: "https://x/foto.jpg", order: 0 }], hasAmbientCover: false, ambient: { poster: { url: "https://x/poster.jpg" } } } });
    assert(flagOff.image === "https://x/foto.jpg", "si el flag está apagado, ignora el póster que quedara");
  });

  await test("bitácora: registra activar, reemplazar y quitar la portada viva, y la cuenta como cambio medible", () => {
    const doc = (coverId?: string) => ({ title: "X", media: coverId ? { hasAmbientCover: true, ambient: { coverId } } : {} });
    const change = (a?: string, b?: string) => diffProperty(snapshotProperty(doc(a)), snapshotProperty(doc(b))).find((c) => c.field === "ambientCover");
    assert(describeChange(change(undefined, "c1")!).text === "Activaste la portada viva", "activar");
    assert(describeChange(change("c1", "c2")!).text === "Cambiaste la portada viva por otra", "reemplazar");
    assert(describeChange(change("c1", undefined)!).text === "Quitaste la portada viva", "quitar");
    assert(change("c1", "c1") === undefined && change(undefined, undefined) === undefined, "sin cambios no registra nada");
  });
}

async function realSample() {
  const dir = path.join(process.cwd(), "1");
  if (!existsSync(dir)) {
    console.log("(no hay carpeta de muestra «1/»: se omite la prueba con la portada real)");
    return;
  }
  const list: FolderEntry[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else list.push({ path: `${rel}${name}`, size: statSync(full).size, read: async () => new Uint8Array(readFileSync(full)) });
    }
  };
  walk(dir, "1/");
  await test("carpeta REAL de muestra «1/»: se acepta completa", async () => {
    const r = await validateFolder(list);
    assert(r.manifest.states.length === 5, `estados: ${r.manifest.states.length}`);
    const total = r.refs.reduce((s, x) => s + x.bytes, 0);
    assert(total < 2 * 1024 * 1024, `pesa ${total} bytes`);
    console.log(`  · carpeta real: ${r.refs.length} archivos, ${(total / 1024).toFixed(0)} KB, estados: ${r.manifest.states.map((s) => s.id).join(", ")}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
