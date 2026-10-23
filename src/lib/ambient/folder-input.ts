import { AMBIENT_MAX_FILE_BYTES } from "./constants";
import { AmbientValidationError, type FolderEntry } from "./validate";

/**
 * Convierte lo que la persona soltó o eligió (una carpeta arrastrada, "Elegir carpeta", archivos sueltos o un .zip) en
 * una lista plana de `FolderEntry` con su ruta relativa. Sólo navegador. No valida nada: eso lo hace `validateFolder`.
 *
 * La carpeta que entrega el proveedor suele llegar comprimida (WhatsApp/mail no mandan carpetas) y iOS Safari no deja
 * elegir carpetas, por eso el .zip es un camino de primera.
 */

/** Tope de archivos al recorrer una carpeta: evita colgar el navegador si sueltan, por error, un disco entero. */
const MAX_WALKED_FILES = 2000;
/** Un .zip no puede expandirse a más que esto (zip bomb). Una portada real pesa ≈1,5 MB. */
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
/** Del zip sólo se leen los tipos que la portada usa; el resto (js, html, txt) ni se descomprime. */
const RELEVANT_EXT = /\.(json|webp|avif)$/i;

const tooMany = () =>
  new AmbientValidationError("too-many-files", "Eso tiene demasiados archivos para ser una portada viva. Elegí sólo la carpeta que te dio el proveedor.");

function fromFile(file: File, path: string): FolderEntry {
  return { path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) };
}

const isZip = (name: string) => /\.zip$/i.test(name);

async function expandZip(file: File): Promise<FolderEntry[]> {
  const { unzipSync } = await import("fflate"); // sólo se descarga si alguien sube un .zip
  const bytes = new Uint8Array(await file.arrayBuffer());
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith("/") || !RELEVANT_EXT.test(f.name) || f.originalSize > AMBIENT_MAX_FILE_BYTES) return false;
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw tooMany();
        return true;
      },
    });
  } catch (err) {
    if (err instanceof AmbientValidationError) throw err;
    throw new AmbientValidationError("no-manifest", "No pudimos abrir el archivo .zip. Probá descomprimirlo y arrastrar la carpeta.");
  }
  return Object.entries(files).map(([path, data]) => ({ path, size: data.length, read: async () => data }));
}

/** Si entre lo elegido hay un .zip, se reemplaza por su contenido. */
async function expandZips(entries: { file?: File; entry: FolderEntry }[]): Promise<FolderEntry[]> {
  const out: FolderEntry[] = [];
  let zips = 0;
  for (const { file, entry } of entries) {
    if (file && isZip(file.name)) {
      if (++zips > 1) throw new AmbientValidationError("many-manifests", "Subí un solo archivo .zip por vez.");
      out.push(...(await expandZip(file)));
    } else {
      out.push(entry);
    }
  }
  return out;
}

/** Archivos elegidos con el selector (carpeta con `webkitdirectory`, o archivos/.zip sueltos). */
export async function entriesFromFiles(list: FileList | File[]): Promise<FolderEntry[]> {
  const files = Array.from(list);
  if (files.length > MAX_WALKED_FILES) throw tooMany();
  return expandZips(files.map((file) => ({ file, entry: fromFile(file, file.webkitRelativePath || file.name) })));
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // `readEntries` devuelve de a tandas (≈100): se repite hasta que viene vacía.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, prefix: string, out: { file: File; path: string }[]): Promise<void> {
  if (out.length > MAX_WALKED_FILES) throw tooMany();
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path: `${prefix}${entry.name}` });
  } else if (entry.isDirectory) {
    for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader())) {
      await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/**
 * Lo que se soltó sobre la zona: carpetas (se recorren enteras), archivos sueltos o un .zip. Los `DataTransferItem`
 * sólo son válidos durante el evento, así que se leen ANTES del primer `await`.
 */
export async function entriesFromDrop(dt: DataTransfer): Promise<FolderEntry[]> {
  const handles = Array.from(dt.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  const plainFiles = Array.from(dt.files);

  const walked: { file: File; path: string }[] = [];
  if (handles.length > 0 && handles.every(Boolean)) {
    for (const handle of handles) await walk(handle!, "", walked);
  } else {
    // Navegador sin `webkitGetAsEntry`: sólo archivos sueltos.
    for (const file of plainFiles) walked.push({ file, path: file.name });
  }
  return expandZips(walked.map(({ file, path }) => ({ file, entry: fromFile(file, path) })));
}
