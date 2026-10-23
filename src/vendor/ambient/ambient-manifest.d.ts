import type { AmbientManifest } from "./index";

export const SCHEMA_VERSION: 1;
export const PARAM_BOUNDS: Readonly<Record<string, readonly [number, number]>>;
export const REQUIRED_PARAMS: readonly string[];
export const OPTIONAL_DEFAULTS: Readonly<Record<string, number>>;

/** Lanza `Error("Invalid experience manifest: …")` si el manifest no cumple el esquema. Es pura: corre igual en Node. */
export function validateManifest(manifest: unknown): AmbientManifest;
