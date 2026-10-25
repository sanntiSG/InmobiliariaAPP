/**
 * Configuración del agente de correo de una inmobiliaria: valores por defecto, validación de lo que llega de la pantalla y
 * guardado. Todo texto libre se limpia (sin saltos de línea ni caracteres de control) antes de guardarse: más tarde forma
 * parte de un mail y no puede servir para inyectar encabezados.
 */
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { MailSettings } from "@/lib/db/models/MailSettings";
import { INQUIRY_CATEGORIES, MAIL_LIMITS, MAIL_MODES, type MailMode } from "./constants";

export type MailSettingsView = {
  mode: MailMode;
  signature: string;
  greeting: string;
  closing: string;
  disclose: boolean;
  maxProperties: number;
  autoCategories: string[];
  autoPerDay: number;
  schedule: { enabled: boolean; from: string; to: string };
  blockedSenders: string[];
};

export const DEFAULT_SETTINGS: MailSettingsView = {
  mode: "confirm",
  signature: "",
  greeting: "",
  closing: "",
  disclose: true,
  maxProperties: 3,
  autoCategories: ["availability", "price", "features", "general"],
  autoPerDay: MAIL_LIMITS.autoPerDayDefault,
  schedule: { enabled: false, from: "09:00", to: "20:00" },
  blockedSenders: [],
};

/** Una línea de texto: sin saltos, sin caracteres de control, con largo máximo. */
const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const sender = z
  .string()
  .transform((s) => s.trim().toLowerCase().replace(/^@/, ""))
  .pipe(z.string().min(3).max(200).regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$|^[a-z0-9.-]+\.[a-z]{2,}$/));

export const settingsPatchSchema = z
  .object({
    mode: z.enum(MAIL_MODES),
    signature: line(200),
    greeting: line(160),
    closing: line(160),
    disclose: z.boolean(),
    maxProperties: z.number().int().min(MAIL_LIMITS.maxPropertiesMin).max(MAIL_LIMITS.maxPropertiesMax),
    autoCategories: z.array(z.enum(INQUIRY_CATEGORIES as unknown as [string, ...string[]])).max(5),
    autoPerDay: z.number().int().min(1).max(MAIL_LIMITS.autoPerDayMax),
    schedule: z.object({ enabled: z.boolean(), from: time, to: time }),
    blockedSenders: z.array(sender).max(50),
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export async function loadSettings(agencyId: string): Promise<MailSettingsView> {
  await connectDB();
  const doc = await MailSettings.findOne({ agencyId }).lean();
  if (!doc) return { ...DEFAULT_SETTINGS };
  return {
    mode: doc.mode ?? DEFAULT_SETTINGS.mode,
    signature: doc.signature ?? "",
    greeting: doc.greeting ?? "",
    closing: doc.closing ?? "",
    disclose: doc.disclose ?? true,
    maxProperties: doc.maxProperties ?? DEFAULT_SETTINGS.maxProperties,
    autoCategories: (doc.autoCategories ?? DEFAULT_SETTINGS.autoCategories).slice(),
    autoPerDay: doc.autoPerDay ?? DEFAULT_SETTINGS.autoPerDay,
    schedule: { enabled: doc.schedule?.enabled ?? false, from: doc.schedule?.from ?? "09:00", to: doc.schedule?.to ?? "20:00" },
    blockedSenders: (doc.blockedSenders ?? []).slice(),
  };
}

export async function saveSettings(agencyId: string, patch: SettingsPatch): Promise<MailSettingsView> {
  await connectDB();
  // Sólo los campos que llegaron (un `$set` por campo): una pantalla vieja no pisa lo que no conoce.
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "schedule") {
      const s = value as NonNullable<SettingsPatch["schedule"]>;
      set["schedule.enabled"] = s.enabled;
      set["schedule.from"] = s.from;
      set["schedule.to"] = s.to;
    } else {
      set[key] = value;
    }
  }
  if (Object.keys(set).length > 0) {
    await MailSettings.updateOne({ agencyId }, { $set: set, $setOnInsert: { agencyId } }, { upsert: true });
  }
  return loadSettings(agencyId);
}
