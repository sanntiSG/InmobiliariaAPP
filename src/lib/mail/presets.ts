/**
 * Proveedores de correo que se pueden vincular con una "contraseña de aplicación" (nunca la contraseña de la cuenta) y los
 * pasos para conseguirla. Los servidores y puertos de cada uno están fijos acá: sólo en "otro" la persona los escribe, y
 * ahí se validan (ver `hosts.ts`). Sin base de datos: lo usan el servidor y el asistente de conexión.
 */
export type MailProviderId = "gmail" | "yahoo" | "icloud" | "custom";

export type MailPreset = {
  id: MailProviderId;
  label: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
  /** Pasos para conseguir la contraseña de aplicación, en orden. */
  steps: string[];
  helpUrl?: string;
  note?: string;
};

export const PRESETS: Record<Exclude<MailProviderId, "custom">, MailPreset> = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    imap: { host: "imap.gmail.com", port: 993 },
    smtp: { host: "smtp.gmail.com", port: 465 },
    steps: [
      "Entrá a tu cuenta de Google y activá la verificación en 2 pasos (si todavía no la tenés).",
      "Abrí myaccount.google.com/apppasswords.",
      "Creá una contraseña de aplicación con el nombre “Recorrr”.",
      "Copiá las 16 letras que te muestra y pegalas acá (los espacios no importan).",
    ],
    helpUrl: "https://myaccount.google.com/apppasswords",
    note: "Si tu cuenta es de trabajo (Google Workspace), puede que tu administrador tenga que habilitar las contraseñas de aplicación.",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo",
    imap: { host: "imap.mail.yahoo.com", port: 993 },
    smtp: { host: "smtp.mail.yahoo.com", port: 465 },
    steps: [
      "Entrá a tu cuenta de Yahoo y abrí “Seguridad de la cuenta”.",
      "Elegí “Generar contraseña de aplicación” (o “Administrar contraseñas de aplicaciones”).",
      "Ponele el nombre “Recorrr” y generala.",
      "Copiá la contraseña y pegala acá.",
    ],
    helpUrl: "https://login.yahoo.com/account/security",
  },
  icloud: {
    id: "icloud",
    label: "iCloud",
    imap: { host: "imap.mail.me.com", port: 993 },
    smtp: { host: "smtp.mail.me.com", port: 587 },
    steps: [
      "Entrá a appleid.apple.com con tu Apple ID.",
      "Abrí “Inicio de sesión y seguridad” y elegí “Contraseñas específicas de la app”.",
      "Creá una con el nombre “Recorrr”.",
      "Copiá la contraseña (con el formato xxxx-xxxx-xxxx-xxxx) y pegala acá.",
    ],
    helpUrl: "https://appleid.apple.com",
  },
};

/** Puertos permitidos para servidores propios (IMAP con TLS; SMTP con TLS o STARTTLS). */
export const ALLOWED_IMAP_PORTS = [993] as const;
export const ALLOWED_SMTP_PORTS = [465, 587] as const;

/** En 465 la conexión nace cifrada; en 587 se cifra después (STARTTLS). */
export const smtpImplicitTls = (port: number): boolean => port === 465;

export function presetFor(id: MailProviderId): MailPreset | null {
  return id === "custom" ? null : PRESETS[id];
}

/** Proveedor probable según el dominio del email (para sugerirlo en el asistente). */
export function providerFromEmail(email: string): MailProviderId {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (/^yahoo\.|^ymail\.com$|^rocketmail\.com$/.test(domain)) return "yahoo";
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return "icloud";
  return "custom";
}
