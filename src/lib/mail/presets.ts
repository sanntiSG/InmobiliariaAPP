/**
 * Proveedores de correo que se pueden vincular con una "contraseña de aplicación" (nunca la contraseña de la cuenta) y los
 * pasos para conseguirla. Los servidores y puertos de cada uno están fijos acá: sólo en "otro" la persona los escribe, y
 * ahí se validan (ver `hosts.ts`). Sin base de datos: lo usan el servidor y el asistente de conexión.
 */
export type MailProviderId = "gmail" | "yahoo" | "icloud" | "custom";

/** Un paso para conseguir la contraseña de aplicación; con `url`, la página exacta donde se hace (se abre en otra pestaña). */
export type MailPresetStep = { text: string; url?: string; action?: string };

export type MailPreset = {
  id: MailProviderId;
  label: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
  /** Pasos para conseguir la contraseña de aplicación, en orden. */
  steps: MailPresetStep[];
  /** Respuestas a lo que más suele trabar ("no me aparece la opción"). */
  trouble: { q: string; a: string }[];
  note?: string;
};

export const PRESETS: Record<Exclude<MailProviderId, "custom">, MailPreset> = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    imap: { host: "imap.gmail.com", port: 993 },
    smtp: { host: "smtp.gmail.com", port: 465 },
    steps: [
      {
        text: "Activá la verificación en 2 pasos de tu cuenta de Google. Si ya la tenés, saltá al paso siguiente.",
        url: "https://myaccount.google.com/signinoptions/two-step-verification",
        action: "Abrir verificación en 2 pasos",
      },
      {
        text: "Entrá a Contraseñas de aplicaciones, escribí el nombre “{nombre}” y tocá Crear.",
        url: "https://myaccount.google.com/apppasswords",
        action: "Abrir contraseñas de aplicaciones",
      },
      { text: "Google te muestra 16 letras en un recuadro amarillo. Copialas y pegalas en el paso siguiente (los espacios no importan)." },
    ],
    trouble: [
      { q: "No me aparece “Contraseñas de aplicaciones”", a: "Casi siempre falta la verificación en 2 pasos: activala con el primer enlace y volvé a abrir el segundo. Si usás una cuenta de trabajo o de un colegio, puede que quien administra tu dominio la tenga bloqueada." },
      { q: "Me dice que la contraseña es incorrecta", a: "Tiene que ser la de 16 letras que creó Google, no la de tu cuenta. Si dudás, creá una nueva y borrá la anterior." },
    ],
    note: "Esta contraseña sirve sólo para esta aplicación: podés borrarla cuando quieras desde la misma página y tu contraseña de siempre no se comparte.",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo",
    imap: { host: "imap.mail.yahoo.com", port: 993 },
    smtp: { host: "smtp.mail.yahoo.com", port: 465 },
    steps: [
      {
        text: "Entrá a la seguridad de tu cuenta de Yahoo. Si todavía no está activa, activá la verificación en 2 pasos.",
        url: "https://login.yahoo.com/account/security",
        action: "Abrir seguridad de Yahoo",
      },
      { text: "Buscá “Conexiones externas” y tocá “Crear contraseña de aplicación”. Ponele el nombre “{nombre}” y generala." },
      { text: "Copiá la contraseña que aparece y pegala en el paso siguiente." },
    ],
    trouble: [
      { q: "No encuentro “Crear contraseña de aplicación”", a: "Yahoo la muestra sólo con la verificación en 2 pasos activa. Usá un navegador donde ya hayas entrado a Yahoo otras veces (no una ventana privada)." },
    ],
  },
  icloud: {
    id: "icloud",
    label: "iCloud",
    imap: { host: "imap.mail.me.com", port: 993 },
    smtp: { host: "smtp.mail.me.com", port: 587 },
    steps: [
      {
        text: "Entrá a tu cuenta de Apple. Hace falta tener activa la autenticación de dos factores.",
        url: "https://account.apple.com",
        action: "Abrir cuenta de Apple",
      },
      { text: "Abrí “Inicio de sesión y seguridad”, elegí “Contraseñas específicas de la app” y creá una con el nombre “{nombre}”." },
      { text: "Copiá la contraseña (con el formato xxxx-xxxx-xxxx-xxxx) y pegala en el paso siguiente." },
    ],
    trouble: [
      { q: "No me deja crear la contraseña", a: "Apple la pide sólo con la autenticación de dos factores activa. Activala desde “Inicio de sesión y seguridad” y volvé a intentar." },
    ],
  },
};

/**
 * El nombre con el que cada inmobiliaria crea su contraseña de aplicación: "Recorrr - Inmobiliaria SS". En la lista de
 * contraseñas de Google, Yahoo o Apple cada una queda identificada, y el administrador sabe de quién es cuando le mandan una.
 * Sin símbolos raros y de hasta 40 caracteres.
 */
export function appPasswordName(agencyName: string | null | undefined): string {
  const clean = (agencyName ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .&'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = clean ? `Recorrr - ${clean}` : "Recorrr";
  return name.length <= 40 ? name : name.slice(0, 40).trim();
}

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
