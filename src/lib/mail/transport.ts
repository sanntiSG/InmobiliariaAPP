/**
 * Conexión real con el correo: leer los mails nuevos por IMAP y enviar una respuesta por SMTP. Es la única parte que habla
 * con servidores de afuera, y por eso es la más cuidada:
 *  - los servidores de un proveedor conocido (Gmail, Yahoo, iCloud) salen de `presets.ts`; los "propios" se validan contra
 *    SSRF y se conecta a la IP ya verificada (`hosts.ts`);
 *  - TLS verificado y de 1.2 en adelante, sin excepciones de certificado;
 *  - IMAP en SÓLO LECTURA: nunca se borra, mueve ni marca nada del buzón;
 *  - sin adjuntos: de cada mail se baja a lo sumo `MAIL_LIMITS.maxBytes`;
 *  - nada de lo que pasa por acá se registra (ni contenido de mails ni contraseñas): los errores se traducen a mensajes
 *    simples y el registro de las librerías está apagado.
 * Las librerías se cargan con `import()` sólo cuando se usan, así no pesan en el resto de la aplicación.
 */
import { htmlToText } from "./clean";
import { MAIL_LIMITS } from "./constants";
import { assertSafeMailHost, HostError } from "./hosts";
import { PRESETS, smtpImplicitTls, type MailProviderId } from "./presets";
import type { MailHeaders } from "./prefilter";

export type MailCreds = {
  provider: MailProviderId;
  email: string;
  password: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
};

export class MailTransportError extends Error {
  constructor(
    public code: "auth" | "network" | "tls" | "host" | "unknown",
    message: string
  ) {
    super(message);
  }
}

/** Traduce el error de una librería a algo que se pueda decir en pantalla (sin datos sensibles). */
export function explain(err: unknown): MailTransportError {
  if (err instanceof MailTransportError) return err;
  if (err instanceof HostError) return new MailTransportError("host", err.message);
  const e = err as { code?: string; authenticationFailed?: boolean; responseText?: string; response?: string; message?: string };
  const text = `${e.responseText ?? ""} ${e.response ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (e.authenticationFailed || e.code === "EAUTH" || /authenticat|invalid credentials|login failed|authentication failed|app.?specific|application-specific/.test(text)) {
    return new MailTransportError(
      "auth",
      "No pude entrar con ese email y esa contraseña. Revisá que sea una contraseña de aplicación (no la de tu cuenta) y que la verificación en 2 pasos esté activada."
    );
  }
  if (e.code === "CERT_HAS_EXPIRED" || e.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || /certificate|self.signed|ssl|tls/.test(text)) {
    return new MailTransportError("tls", "El certificado del servidor de correo no es válido, así que no me conecté (por tu seguridad).");
  }
  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ESOCKET", "ETIMEOUT", "NoConnection"].includes(e.code ?? "") || /timeout|timed out|connect|getaddrinfo/.test(text)) {
    return new MailTransportError("network", "No pude conectarme al servidor de correo. Revisá los datos del servidor o probá de nuevo en unos minutos.");
  }
  return new MailTransportError("unknown", "El servidor de correo respondió con un error inesperado.");
}

type Target = { host: string; servername?: string };

/** A qué servidor conectarse: el del proveedor tal cual, o —en servidores propios— la IP pública ya verificada. */
async function targetOf(creds: MailCreds, kind: "imap" | "smtp"): Promise<Target> {
  const { host, port } = creds[kind];
  if (creds.provider !== "custom") {
    const preset = PRESETS[creds.provider];
    if (preset[kind].host !== host || preset[kind].port !== port) throw new MailTransportError("host", "Los datos del servidor no coinciden con el proveedor.");
    return { host };
  }
  const safe = await assertSafeMailHost(host, port, kind);
  return { host: safe.address, servername: safe.host };
}

const TLS = { minVersion: "TLSv1.2" as const, rejectUnauthorized: true };

async function openImap(creds: MailCreds) {
  const { ImapFlow } = await import("imapflow");
  const t = await targetOf(creds, "imap");
  const client = new ImapFlow({
    host: t.host,
    port: creds.imap.port,
    secure: true,
    servername: t.servername,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    tls: { ...TLS, ...(t.servername ? { servername: t.servername } : {}) },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 20_000,
    disableAutoIdle: true,
    clientInfo: { name: "Recorrr" },
  });
  // Un error en la conexión no atrapado tiraría abajo el proceso: se escucha y se descarta (el error real sale de las llamadas).
  client.on("error", () => {});
  await client.connect();
  return client;
}

export type InboxInfo = { uidNext: number; uidValidity: string; exists: number };

/** Prueba de punta a punta: entrar por IMAP, ver la bandeja de entrada y comprobar que el servidor de salida acepta los datos. */
export async function testConnection(creds: MailCreds): Promise<InboxInfo> {
  let info: InboxInfo;
  try {
    const client = await openImap(creds);
    try {
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        const mb = client.mailbox;
        if (!mb || typeof mb === "boolean") throw new MailTransportError("unknown", "No pude abrir la bandeja de entrada.");
        info = { uidNext: mb.uidNext, uidValidity: String(mb.uidValidity), exists: mb.exists };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (err) {
    throw explain(err);
  }

  try {
    const transporter = await smtpTransport(creds);
    await transporter.verify();
    transporter.close();
  } catch (err) {
    const e = explain(err);
    if (e.code === "auth") throw e;
    throw new MailTransportError(e.code, `Pude leer tu correo, pero no pude conectarme para enviar: ${e.message}`);
  }
  return info;
}

export type FetchedMail = {
  uid: number;
  messageId: string;
  from: { name: string; email: string };
  replyTo: string | null;
  subject: string;
  text: string;
  date: Date;
  headers: MailHeaders;
  /** Resultado de las verificaciones del servidor de origen (SPF/DKIM/DMARC) según el encabezado que agrega tu proveedor. */
  auth: "pass" | "fail" | "unknown";
  inReplyTo: string | null;
  references: string[];
};

export type PollState = { uidValidity: string | null; lastUid: number };
export type PollOutput = { uidValidity: string; uidNext: number; /** La bandeja cambió de identidad o es la primera vez: no se procesó nada. */ reset: boolean; mails: FetchedMail[]; lastUid: number };

const headerText = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(headerText).filter(Boolean).join(", ") || null;
  if (typeof v === "object" && "value" in v) return headerText((v as { value: unknown }).value);
  if (typeof v === "object" && "text" in v) return headerText((v as { text: unknown }).text);
  return null;
};

/** Qué dice el servidor sobre SPF/DKIM/DMARC del remitente. */
export function parseAuth(header: string | null): "pass" | "fail" | "unknown" {
  const h = (header ?? "").toLowerCase();
  if (!h) return "unknown";
  if (/\b(dmarc|dkim|spf)=(fail|softfail|permerror|temperror)\b/.test(h)) return "fail";
  if (/\b(dmarc|dkim|spf)=pass\b/.test(h)) return "pass";
  return "unknown";
}

/**
 * Lee los mails nuevos (los que llegaron DESPUÉS de lo ya visto). Si es la primera vez, o si el proveedor reinició la
 * numeración de la bandeja (`uidValidity`), NO se procesa nada: se anota hasta dónde llega hoy y se sigue desde ahí. Así
 * el agente nunca contesta el historial.
 */
export async function pollNew(creds: MailCreds, state: PollState, opts: { deadline: number; limit?: number }): Promise<PollOutput> {
  const limit = opts.limit ?? MAIL_LIMITS.perPoll;
  try {
    const client = await openImap(creds);
    try {
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        const mb = client.mailbox;
        if (!mb || typeof mb === "boolean") throw new MailTransportError("unknown", "No pude abrir la bandeja de entrada.");
        const uidValidity = String(mb.uidValidity);
        const top = mb.uidNext - 1;
        if (state.uidValidity !== uidValidity) return { uidValidity, uidNext: mb.uidNext, reset: true, mails: [], lastUid: top };
        if (top <= state.lastUid) return { uidValidity, uidNext: mb.uidNext, reset: false, mails: [], lastUid: state.lastUid };

        const { simpleParser } = await import("mailparser");
        const mails: FetchedMail[] = [];
        let lastUid = state.lastUid;
        for await (const msg of client.fetch(`${state.lastUid + 1}:*`, { uid: true, source: { maxLength: MAIL_LIMITS.maxBytes }, internalDate: true }, { uid: true })) {
          // `N:*` siempre devuelve el último mail aunque N lo supere: se descarta lo que ya se vio.
          if (msg.uid <= state.lastUid) continue;
          if (mails.length >= limit || Date.now() > opts.deadline) break;
          lastUid = msg.uid;
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
          const fromAddr = parsed.from?.value?.[0];
          const email = (fromAddr?.address ?? "").toLowerCase();
          const replyTo = parsed.replyTo?.value?.[0]?.address?.toLowerCase() ?? null;
          const subject = (parsed.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 300);
          const text = (parsed.text ?? (typeof parsed.html === "string" ? htmlToText(parsed.html) : "")).slice(0, MAIL_LIMITS.maxBytes);
          const get = (name: string) => headerText(parsed.headers.get(name));
          const refs = (parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : []).slice(0, 10);
          mails.push({
            uid: msg.uid,
            messageId: parsed.messageId ?? `uid:${uidValidity}:${msg.uid}`,
            from: { name: (fromAddr?.name ?? "").slice(0, 120), email },
            replyTo,
            subject,
            text,
            date: parsed.date ?? (msg.internalDate instanceof Date ? msg.internalDate : new Date()),
            headers: {
              from: fromAddr?.address ? `${fromAddr.name ?? ""} <${fromAddr.address}>` : "",
              replyTo,
              subject,
              autoSubmitted: get("auto-submitted"),
              precedence: get("precedence"),
              listId: get("list-id"),
              listUnsubscribe: get("list-unsubscribe"),
              xAutoreply: get("x-autoreply") ?? get("x-autorespond"),
              contentType: get("content-type"),
              returnPath: get("return-path"),
            },
            auth: parseAuth(get("authentication-results")),
            inReplyTo: parsed.inReplyTo ?? null,
            references: refs,
          });
        }
        return { uidValidity, uidNext: mb.uidNext, reset: false, mails, lastUid };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (err) {
    throw explain(err);
  }
}

async function smtpTransport(creds: MailCreds) {
  const nodemailer = await import("nodemailer");
  const t = await targetOf(creds, "smtp");
  return nodemailer.createTransport({
    host: t.host,
    port: creds.smtp.port,
    secure: smtpImplicitTls(creds.smtp.port),
    requireTLS: !smtpImplicitTls(creds.smtp.port),
    auth: { user: creds.email, pass: creds.password },
    tls: { ...TLS, ...(t.servername ? { servername: t.servername } : {}) },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15_000,
    logger: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export type OutgoingReply = {
  to: string;
  fromName: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
  /** Salió sin que una persona la revisara: se marca como respuesta automática (así otros sistemas no le contestan en bucle). */
  auto: boolean;
};

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Envía la respuesta a UNA sola persona (el sobre se fija a mano: nada del texto puede agregar destinatarios). */
export async function sendReply(creds: MailCreds, mail: OutgoingReply): Promise<{ messageId: string }> {
  if (!EMAIL.test(mail.to) || /[\r\n]/.test(mail.to)) throw new MailTransportError("unknown", "La dirección de destino no es válida.");
  try {
    const transporter = await smtpTransport(creds);
    const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
    const info = await transporter.sendMail({
      from: { name: clean(mail.fromName).slice(0, 80), address: creds.email },
      to: mail.to,
      envelope: { from: creds.email, to: [mail.to] },
      subject: clean(mail.subject).slice(0, 200),
      text: mail.text,
      ...(mail.inReplyTo ? { inReplyTo: clean(mail.inReplyTo) } : {}),
      ...(mail.references.length > 0 ? { references: mail.references.map(clean).slice(-10) } : {}),
      ...(mail.auto ? { headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" } } : {}),
    });
    transporter.close();
    return { messageId: String(info.messageId ?? "") };
  } catch (err) {
    throw explain(err);
  }
}
