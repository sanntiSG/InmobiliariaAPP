/**
 * Responder desde el panel la duda que el agente dejó pendiente ("sobre mascotas te lo confirmamos"). Acá vive lo que no
 * depende de la base: el texto con el que arranca el cuadro de respuesta y los topes. Función pura.
 */
import { list } from "@/lib/advisor/compose/format";
import { firstNameOf } from "./prefilter";
import type { MailSettingsView } from "./settings";

export const FOLLOWUP_LIMITS = {
  /** Respuestas posteriores por mail. */
  max: 10,
  minChars: 3,
  maxChars: 6000,
} as const;

/** Sin caracteres de control (salvo saltos de línea y tabulaciones) y con saltos normalizados. */
export const cleanFollowUp = (body: string): string =>
  body
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

/**
 * El texto con el que arranca el cuadro: saludo, el tema que hay que contestar (si se sabe) y el cierre y la firma de la
 * inmobiliaria. La persona escribe en el hueco; nada de esto se envía sin que ella lo vea y lo confirme.
 */
export function followUpStarter(input: { fromName: string | null; topics: readonly string[]; settings: Pick<MailSettingsView, "closing" | "signature">; agencyName: string }): string {
  const name = firstNameOf(input.fromName);
  const topic = input.topics.length > 0 ? `Sobre ${list([...input.topics])}: ` : "";
  return [name ? `Hola ${name},` : "Hola,", topic, input.settings.closing.trim() || "Quedamos a tu disposición.", input.settings.signature.trim() || `Equipo de ${input.agencyName}`].join("\n\n");
}
