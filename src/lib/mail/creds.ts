/**
 * Las credenciales de un buzón guardado, listas para conectarse: abre la contraseña cifrada (sólo en memoria, sólo mientras
 * dura la operación) verificando que pertenece a ESE buzón de ESA inmobiliaria.
 */
import { mailboxAad, SecretBoxError, secretBox } from "@/lib/security/secret-box";
import { MailTransportError, type MailCreds } from "./transport";

export type StoredMailbox = {
  _id: unknown;
  agencyId: unknown;
  provider: MailCreds["provider"];
  email: string;
  imap?: { host: string; port: number } | null;
  smtp?: { host: string; port: number } | null;
  secret?: string | null;
};

export function openCreds(mailbox: StoredMailbox): MailCreds {
  if (!mailbox.secret || !mailbox.imap || !mailbox.smtp) throw new MailTransportError("auth", "Falta la contraseña del buzón: volvé a conectarlo.");
  let password: string;
  try {
    password = secretBox.open(mailbox.secret, mailboxAad(String(mailbox.agencyId), String(mailbox._id)));
  } catch (err) {
    if (err instanceof SecretBoxError) {
      throw new MailTransportError("unknown", "No se pudo abrir la contraseña guardada (cambió la clave del servidor): volvé a conectar el buzón.");
    }
    throw err;
  }
  return {
    provider: mailbox.provider,
    email: mailbox.email,
    password,
    imap: { host: mailbox.imap.host, port: mailbox.imap.port },
    smtp: { host: mailbox.smtp.host, port: mailbox.smtp.port },
  };
}
