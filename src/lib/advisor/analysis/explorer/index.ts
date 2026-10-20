import type { ExplorerIntent } from "../../types";
import type { Handler } from "../types";

/** Handlers del modo explorador (se completan en la fase de explorador). */
export const EXPLORER_HANDLERS: Partial<Record<ExplorerIntent, Handler>> = {};
