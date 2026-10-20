import { getAdminConfigState, getPublishedConfig } from "./config";

/** Cómo se presenta el asesor en sus textos ("Soy Nubo"). */
export type Persona = { name: string };

const GENERIC = "tu asesor";

/** Persona publicada; con `draft` (sólo para la prueba del admin) usa el borrador. */
export async function getPersona(opts: { draft?: boolean } = {}): Promise<Persona> {
  try {
    const content = opts.draft ? (await getAdminConfigState()).draft : await getPublishedConfig();
    return { name: content.name || GENERIC };
  } catch {
    return { name: GENERIC };
  }
}
