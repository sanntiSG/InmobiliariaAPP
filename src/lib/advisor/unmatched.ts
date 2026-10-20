import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db/connect";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import type { AdvisorMode } from "./types";
import { normalizeText } from "./nlu/normalize";

const RETENTION_MS = 90 * 86_400_000;
const MAX_TEXT = 120;

/**
 * Saca lo que podría identificar a alguien antes de guardar la pregunta:
 * emails, links, teléfonos / números largos y usuarios (@algo).
 */
export function maskQuestion(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\S+@\S+\.\S+/g, "[email]")
    .replace(/@\w+/g, "[usuario]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Registra una pregunta no entendida. Nunca lanza: es un apoyo para mejorar el
 * motor, no puede romper la respuesta al usuario.
 */
export async function logUnmatched(text: string, mode: AdvisorMode, kind: "unknown" | "clarify"): Promise<void> {
  try {
    const masked = maskQuestion(text);
    const norm = normalizeText(masked);
    if (norm.length < 3) return;
    const hash = createHash("sha1").update(`${mode}:${norm}`).digest("hex");
    const now = new Date();
    await connectDB();
    await AdvisorUnmatched.updateOne(
      { hash },
      {
        $inc: { count: 1 },
        $set: { lastAt: now, expiresAt: new Date(now.getTime() + RETENTION_MS), kind },
        $setOnInsert: { text: masked, mode, firstAt: now },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("logUnmatched failed:", err);
  }
}
