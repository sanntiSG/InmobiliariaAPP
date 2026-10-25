/**
 * Pruebas del agente de correo — sin base de datos ni red: cifrado de credenciales, clave del cron, defensa contra SSRF,
 * limpieza de mails, filtros, clasificación (con mails de ejemplo en castellano), redacción de respuestas y decisiones del
 * modo automático. Correr con `npm run mail:check`: sale con código 1 si alguna falla.
 */
import { createSecretBox, SecretBoxError, mailboxAad } from "../src/lib/security/secret-box";
import { cronSecrets, verifyCronRequest } from "../src/lib/security/cron-auth";
import { CRON_TOKEN_LABEL, deriveCronToken } from "../src/lib/security/cron-token";
import { mailRuntime } from "../src/lib/mail/runtime";
import { explain, MailTransportError, parseAuth } from "../src/lib/mail/transport";
import { getPublicSiteUrl, publicSiteUrl, siteHosts } from "../src/lib/mail/site";
import { assertSafeMailHost, HostError, isPrivateIp } from "../src/lib/mail/hosts";
import { cleanBody, htmlToText } from "../src/lib/mail/clean";
import { firstNameOf, prefilter, replyAddress, type MailHeaders } from "../src/lib/mail/prefilter";
import { classifyMail } from "../src/lib/mail/classify";
import { extractSlugs } from "../src/lib/mail/refs";
import { composeReply, replySubject, type ComposeInput, type ReplyProperty } from "../src/lib/mail/compose";
import { argentinaClock, decideAuto, inSchedule, type AutoInput } from "../src/lib/mail/decide";
import { presetFor, providerFromEmail, smtpImplicitTls } from "../src/lib/mail/presets";
import type { PropertyFacts } from "../src/lib/agents/knowledge/facts";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
const throwsCode = (fn: () => unknown, code: string): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof SecretBoxError && e.code === code;
  }
};

// ── Cifrado de credenciales ─────────────────────────────────────────────────
{
  const k1 = Buffer.alloc(32, 1).toString("base64");
  const k2 = Buffer.alloc(32, 2).toString("base64");
  const box = createSecretBox({ current: k1 });
  const aad = mailboxAad("agency1", "box1");
  const sealed = box.seal("abcd efgh ijkl mnop", aad);
  check("secret-box: ida y vuelta", box.open(sealed, aad) === "abcd efgh ijkl mnop");
  check("secret-box: lo guardado no contiene la contraseña", !sealed.includes("abcd") && sealed.startsWith("v1:") && sealed.split(":").length === 5, sealed);
  check("secret-box: cada cifrado es distinto (iv aleatorio)", box.seal("x", aad) !== box.seal("x", aad));
  check("secret-box: otro dueño (AAD) no puede abrirlo", throwsCode(() => box.open(sealed, mailboxAad("agency2", "box1")), "tampered"));
  const parts = sealed.split(":");
  const flipped = [...parts.slice(0, 4), parts[4]!.slice(0, -2) + (parts[4]!.endsWith("AA") ? "BB" : "AA")].join(":");
  check("secret-box: un byte cambiado se detecta", throwsCode(() => box.open(flipped, aad), "tampered"));
  check("secret-box: formato inválido", throwsCode(() => box.open("hola", aad), "bad_format") && throwsCode(() => box.open("v2:a:b:c:d", aad), "bad_format"));
  check("secret-box: sin clave no cifra", throwsCode(() => createSecretBox({}).seal("x", aad), "no_key") && !createSecretBox({}).ready());
  check("secret-box: una clave de largo incorrecto no sirve", !createSecretBox({ current: "abc" }).ready());
  const rotated = createSecretBox({ current: k2, previous: k1 });
  check("rotación: abre lo cifrado con la clave anterior", rotated.open(sealed, aad) === "abcd efgh ijkl mnop" && rotated.needsRotation(sealed));
  check("rotación: lo nuevo ya no pide rotar", !rotated.needsRotation(rotated.seal("x", aad)));
  check("rotación: sin la clave anterior no abre", throwsCode(() => createSecretBox({ current: k2 }).open(sealed, aad), "unknown_key"));
}

// ── Clave del cron ──────────────────────────────────────────────────────────
{
  const secret = "s".repeat(40);
  const req = (auth?: string) => new Request("https://x.test/api/cron", { headers: auth ? { authorization: auth } : {} });
  check("cron: la clave correcta pasa", verifyCronRequest(req(`Bearer ${secret}`), [secret]));
  check("cron: otra clave no pasa", !verifyCronRequest(req(`Bearer ${"t".repeat(40)}`), [secret]));
  check("cron: sin encabezado no pasa", !verifyCronRequest(req(), [secret]));
  check("cron: sin 'Bearer' no pasa", !verifyCronRequest(req(secret), [secret]));
  check("cron: sin claves configuradas nadie pasa", !verifyCronRequest(req("Bearer x"), []) && !verifyCronRequest(req("Bearer "), [""]));
  check("cron: una clave corta se rechaza aunque coincida", !verifyCronRequest(req("Bearer corta"), ["corta"]));
  check("cron: con varias claves pasa cualquiera de ellas", verifyCronRequest(req(`Bearer ${secret}`), ["z".repeat(40), secret]));

  // La clave de la revisión se deriva de la de cifrado: una sola variable en la plataforma.
  const key = Buffer.alloc(32, 7).toString("base64");
  const other = Buffer.alloc(32, 8).toString("base64");
  const token = deriveCronToken(key);
  check("cron-token: es determinista, hexadecimal y no contiene la clave", token === deriveCronToken(key) && /^[0-9a-f]{64}$/.test(token) && !token.includes(key) && CRON_TOKEN_LABEL.length > 0);
  check("cron-token: otra clave da otro token", token !== deriveCronToken(other));
  check("cron-token: ignora espacios alrededor de la clave", token === deriveCronToken(`  ${key}
`));
  check("cronSecrets: con la clave de cifrado válida aparece el token derivado", cronSecrets({ MAIL_CREDENTIALS_KEY: key }).join() === token, cronSecrets({ MAIL_CREDENTIALS_KEY: key }));
  check("cronSecrets: una clave inválida o corta no aporta nada", cronSecrets({ MAIL_CREDENTIALS_KEY: "abc" }).length === 0 && cronSecrets({ CRON_SECRET: "corta" }).length === 0 && cronSecrets({}).length === 0);
  check("cronSecrets: CRON_SECRET (≥32) se suma como opción", cronSecrets({ MAIL_CREDENTIALS_KEY: key, CRON_SECRET: secret }).length === 2 && cronSecrets({ CRON_SECRET: secret })[0] === secret);
  check("cron: el token derivado pasa y la clave de cifrado en crudo NO", verifyCronRequest(req(`Bearer ${token}`), cronSecrets({ MAIL_CREDENTIALS_KEY: key })) && !verifyCronRequest(req(`Bearer ${key}`), cronSecrets({ MAIL_CREDENTIALS_KEY: key })));
}

// ── Dirección pública del sitio ─────────────────────────────────────────────
{
  check("site: https válido", getPublicSiteUrl("https://recorrr.example/") === "https://recorrr.example");
  check("site: http sólo para localhost", getPublicSiteUrl("http://localhost:3000") === "http://localhost:3000" && getPublicSiteUrl("http://recorrr.example") === null);
  check("site: basura → null", getPublicSiteUrl("javascript:alert(1)") === null && getPublicSiteUrl("no es una url") === null && getPublicSiteUrl(undefined) === null);
  check("site: AUTH_URL sirve cuando falta PUBLIC_SITE_URL", publicSiteUrl({ AUTH_URL: "https://sitio.netlify.app" }) === "https://sitio.netlify.app" && publicSiteUrl({ PUBLIC_SITE_URL: "https://propio.example", AUTH_URL: "https://sitio.netlify.app" }) === "https://propio.example");
  check("site: una PUBLIC_SITE_URL inválida cae en AUTH_URL; sin ninguna, null", publicSiteUrl({ PUBLIC_SITE_URL: "ftp://x", AUTH_URL: "https://sitio.netlify.app" }) === "https://sitio.netlify.app" && publicSiteUrl({}) === null);
  check("siteHosts: reconoce también el host de AUTH_URL", siteHosts({ site: "https://propio.example", auth: "https://sitio.netlify.app" }).join() === "propio.example,sitio.netlify.app");
  check("siteHosts: junta el sitio y los extra, sin basura", siteHosts({ site: "https://recorrr.example", extra: "www.recorrr.example, evil host ,otro.com" }).join() === "recorrr.example,www.recorrr.example,otro.com", siteHosts({ site: "https://recorrr.example", extra: "www.recorrr.example, evil host ,otro.com" }));
}

// ── Qué puede hacer cada despliegue (sin cargar variables de más) ───────────
{
  const key = Buffer.alloc(32, 9).toString("base64");
  const main = mailRuntime({ MAIL_CREDENTIALS_KEY: key });
  check("runtime: con sólo la clave, la web principal revisa y envía", main.keyReady && main.platform === "main" && main.poller && main.sender, main);
  const backup = mailRuntime({ MAIL_CREDENTIALS_KEY: key, RENDER: "true" });
  check("runtime: en Render (respaldo) no revisa ni envía, aunque tenga la clave", backup.keyReady && backup.platform === "backup" && !backup.poller && !backup.sender, backup);
  const none = mailRuntime({});
  check("runtime: sin clave no hay nada activo", !none.keyReady && !none.poller && !none.sender, none);
  check("runtime: una clave mal pegada cuenta como ausente", !mailRuntime({ MAIL_CREDENTIALS_KEY: "abc", MAIL_POLLER_ENABLED: "true", MAIL_SEND_ENABLED: "true" }).poller);
  const off = mailRuntime({ MAIL_CREDENTIALS_KEY: key, MAIL_POLLER_ENABLED: "false", MAIL_SEND_ENABLED: "false" });
  check("runtime: 'false' apaga aunque haya clave", !off.poller && !off.sender, off);
  const paid = mailRuntime({ MAIL_CREDENTIALS_KEY: key, RENDER: "true", MAIL_POLLER_ENABLED: "true", MAIL_SEND_ENABLED: "true" });
  check("runtime: 'true' forzado enciende incluso en Render (plan pago)", paid.poller && paid.sender && paid.platform === "backup", paid);
  check("runtime: valores raros no cambian el comportamiento por defecto", mailRuntime({ MAIL_CREDENTIALS_KEY: key, MAIL_POLLER_ENABLED: "1", MAIL_SEND_ENABLED: "yes" }).poller);
}

// ── Mensajes de error de la conexión y verificación del remitente ───────────
{
  const code = (e: unknown) => explain(e).code;
  check("explain: contraseña equivocada → auth, y dice qué hacer", code({ authenticationFailed: true }) === "auth" && /contraseña de aplicación nueva/.test(explain({ code: "EAUTH" }).message));
  check("explain: Gmail pide contraseña de aplicación → auth", code({ responseText: "[ALERT] Application-specific password required" }) === "auth");
  check("explain: IMAP desactivado → disabled", code({ message: "IMAP access is disabled for your account" }) === "disabled" && /IMAP/.test(explain({ message: "imap not enabled" }).message));
  check("explain: certificado → tls", code({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) === "tls" && code({ message: "certificate has expired" }) === "tls");
  check("explain: demasiados intentos → busy", code({ message: "Too many login attempts, try again later" }) === "busy");
  check("explain: sin red → network", code({ code: "ENOTFOUND" }) === "network" && code({ code: "ETIMEDOUT" }) === "network" && code({ message: "Connection timeout" }) === "network");
  check("explain: algo raro → unknown, sin filtrar el texto original", code({ message: "boom con datos privados" }) === "unknown" && !explain({ message: "boom con datos privados" }).message.includes("privados"));
  const own = new MailTransportError("host", "ya traducido");
  check("explain: un error ya traducido pasa tal cual", explain(own) === own);
  check("explain: ningún mensaje deja pasar contraseñas ni correos", ["auth", "disabled", "busy", "network", "tls", "unknown"].every((c) => !/@|password=|pass=/i.test(explain(c === "auth" ? { code: "EAUTH" } : c === "disabled" ? { message: "imap disabled" } : c === "busy" ? { message: "too many" } : c === "network" ? { code: "ENOTFOUND" } : c === "tls" ? { message: "ssl" } : { message: "x" }).message)));

  check("parseAuth: pass si alguna verificación pasa", parseAuth("mx.google.com; dkim=pass header.i=@x.com; spf=pass") === "pass" && parseAuth("mx; dmarc=pass") === "pass");
  check("parseAuth: fail gana sobre pass", parseAuth("mx; spf=pass; dkim=fail") === "fail" && parseAuth("mx; dmarc=fail (p=reject)") === "fail" && parseAuth("mx; spf=softfail") === "fail");
  check("parseAuth: sin encabezado o sin datos → unknown", parseAuth(null) === "unknown" && parseAuth("") === "unknown" && parseAuth("mx; dkim=none; spf=neutral") === "unknown");
}

// ── Servidores de correo (SSRF) ─────────────────────────────────────────────
async function hosts() {
  const priv = ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "no-es-ip"];
  const pub = ["8.8.8.8", "172.32.0.1", "172.15.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
  check("hosts: las direcciones privadas y reservadas se rechazan", priv.every(isPrivateIp), priv.filter((p) => !isPrivateIp(p)));
  check("hosts: las públicas pasan", pub.every((p) => !isPrivateIp(p)), pub.filter(isPrivateIp));

  const ok = (addr: string) => async () => [{ address: addr, family: 4 }];
  const r = await assertSafeMailHost("IMAP.Hosting.com.ar ", 993, "imap", ok("200.1.2.3"));
  check("hosts: un servidor público devuelve su IP", r.host === "imap.hosting.com.ar" && r.address === "200.1.2.3", r);
  const bad = async (host: string, port: number, kind: "imap" | "smtp", resolver = ok("200.1.2.3")) => {
    try {
      await assertSafeMailHost(host, port, kind, resolver);
      return false;
    } catch (e) {
      return e instanceof HostError;
    }
  };
  check("hosts: se rechaza una IP escrita a mano", await bad("203.0.113.5", 993, "imap"));
  check("hosts: se rechaza localhost y .local", (await bad("localhost", 993, "imap")) && (await bad("impresora.local", 993, "imap")) && (await bad("db.internal", 993, "imap")));
  check("hosts: se rechazan puertos fuera de la lista", (await bad("mail.x.com", 22, "imap")) && (await bad("mail.x.com", 25, "smtp")) && (await bad("mail.x.com", 465, "imap")));
  check("hosts: se acepta SMTP en 465 y 587", !(await bad("smtp.x.com", 465, "smtp")) && !(await bad("smtp.x.com", 587, "smtp")));
  check("hosts: un nombre que resuelve a una IP privada se rechaza", await bad("mail.x.com", 993, "imap", ok("10.1.1.1")));
  check("hosts: si UNA de las IP es privada se rechaza", await bad("mail.x.com", 993, "imap", async () => [{ address: "8.8.8.8", family: 4 }, { address: "192.168.0.5", family: 4 }]));
  check("hosts: si el DNS falla se rechaza", await bad("mail.x.com", 993, "imap", async () => { throw new Error("ENOTFOUND"); }));
  check("hosts: nombres con caracteres raros se rechazan", (await bad("mail.x.com/../", 993, "imap")) && (await bad("a b.com", 993, "imap")) && (await bad("-x.com", 993, "imap")));
}

// ── Proveedores ─────────────────────────────────────────────────────────────
{
  check("presets: Gmail usa los servidores y puertos de siempre", presetFor("gmail")?.imap.host === "imap.gmail.com" && presetFor("gmail")?.imap.port === 993 && presetFor("gmail")?.smtp.port === 465);
  check("presets: 'otro' no tiene preset", presetFor("custom") === null);
  check("presets: 465 cifra desde el inicio, 587 con STARTTLS", smtpImplicitTls(465) && !smtpImplicitTls(587));
  check("presets: se sugiere el proveedor por el dominio", providerFromEmail("a@gmail.com") === "gmail" && providerFromEmail("a@yahoo.com.ar") === "yahoo" && providerFromEmail("a@icloud.com") === "icloud" && providerFromEmail("a@miinmo.com.ar") === "custom");
  check("presets: cada proveedor trae pasos para la contraseña de aplicación", (["gmail", "yahoo", "icloud"] as const).every((id) => (presetFor(id)?.steps.length ?? 0) >= 3));
}

// ── Limpieza del texto ──────────────────────────────────────────────────────
{
  const quoted = "Hola, ¿sigue disponible?\n\nEl 3 oct 2026 a las 10:00, Inmobiliaria <info@x.com> escribió:\n> La casa está en venta.\n> Saludos";
  check("limpieza: corta desde 'X escribió:' y las citas", cleanBody(quoted) === "Hola, ¿sigue disponible?", cleanBody(quoted));
  check("limpieza: una cita en dos renglones", cleanBody("Gracias!\n\nEl vie, 3 oct 2026 a las 10:00, Juan Pérez\n<juan@x.com> escribió:\n> hola") === "Gracias!");
  check("limpieza: 'On … wrote:' en inglés", cleanBody("Thanks\n\nOn Fri, Oct 3, 2026 at 10:00 AM Ana <a@x.com> wrote:\n> hi") === "Thanks");
  check("limpieza: mensaje original de Outlook", cleanBody("Quiero visitarla.\n\n-----Mensaje original-----\nDe: x\nAsunto: y") === "Quiero visitarla.");
  check("limpieza: encabezado 'De:' pegado", cleanBody("Cuánto sale?\n\nDe: Ana <a@x.com>\nEnviado el: lunes\nPara: y") === "Cuánto sale?");
  check("limpieza: firma con '-- '", cleanBody("Gracias.\n-- \nJuan Pérez\n+54 11 5555") === "Gracias.");
  check("limpieza: 'Enviado desde mi iPhone'", cleanBody("¿Está disponible?\n\nEnviado desde mi iPhone") === "¿Está disponible?");
  check("limpieza: aviso legal", cleanBody("Hola\nEste mensaje es confidencial y está dirigido sólo al destinatario.") === "Hola");
  check("limpieza: caracteres invisibles", cleanBody(`Ho${String.fromCharCode(0x200b)}la${String.fromCharCode(0xfeff)}`) === "Hola");
  check("limpieza: caracteres de control", cleanBody("Hola\u0000\u0007 mundo") === "Hola mundo");
  check("limpieza: acota el largo", cleanBody("a".repeat(20000), 8000).length === 8000);
  check("limpieza: líneas en blanco de más", cleanBody("a\n\n\n\n\nb") === "a\n\nb");
  const html = htmlToText("<style>x{}</style><p>Hola <b>mundo</b></p><script>evil()</script><br>ok &amp; fin");
  check("htmlToText: sin etiquetas ni scripts", html === "Hola mundo\n\nok & fin" && !/evil|<|x\{/.test(html), html);
}

// ── Filtro por encabezados ──────────────────────────────────────────────────
{
  const ctx = { ownEmail: "inmo@miinmo.com.ar", blocked: ["spammer@x.com", "@malos.com"] };
  const h = (over: Partial<MailHeaders>): MailHeaders => ({ from: "Juan Pérez <juan@gmail.com>", subject: "Consulta", ...over });
  const skipCat = (over: Partial<MailHeaders>) => {
    const r = prefilter(h(over), ctx);
    return r.skip ? r.category : "pasa";
  };
  check("filtro: una persona común pasa", skipCat({}) === "pasa");
  check("filtro: Auto-Submitted → automático", skipCat({ autoSubmitted: "auto-replied" }) === "automated" && skipCat({ autoSubmitted: "no" }) === "pasa");
  check("filtro: Precedence bulk/list → lista", skipCat({ precedence: "bulk" }) === "newsletter" && skipCat({ precedence: "list" }) === "newsletter");
  check("filtro: List-Unsubscribe → lista", skipCat({ listUnsubscribe: "<mailto:x@y.com>" }) === "newsletter" && skipCat({ listId: "<promos.x.com>" }) === "newsletter");
  check("filtro: mailer-daemon y multipart/report → rebote", skipCat({ from: "MAILER-DAEMON@mail.x.com" }) === "bounce" && skipCat({ contentType: "multipart/report; report-type=delivery-status" }) === "bounce" && skipCat({ returnPath: "<>" }) === "bounce");
  check("filtro: casilla no-reply → automático", skipCat({ from: "no-reply@banco.com" }) === "automated" && skipCat({ from: "noreply@x.com" }) === "automated");
  check("filtro: asuntos de respuesta automática", skipCat({ subject: "Respuesta automática: de vacaciones" }) === "automated" && skipCat({ subject: "Out of office" }) === "automated" && skipCat({ subject: "Fuera de la oficina" }) === "automated" && skipCat({ xAutoreply: "yes" }) === "automated");
  check("filtro: el propio buzón se ignora", skipCat({ from: "INMO@miinmo.com.ar" }) === "other");
  check("filtro: remitente y dominio bloqueados", skipCat({ from: "spammer@x.com" }) === "other" && skipCat({ from: "alguien@malos.com" }) === "other" && skipCat({ replyTo: "x@malos.com" }) === "other");
  const portal = prefilter(h({ from: "Zonaprop <no-reply@zonaprop.com.ar>", replyTo: "cliente@gmail.com" }), ctx);
  check("filtro: un portal con Reply-To del cliente PASA", !portal.skip && portal.portal);
  const portalSin = prefilter(h({ from: "Zonaprop <no-reply@mail.zonaprop.com.ar>" }), ctx);
  check("filtro: un portal sin Reply-To no tiene a quién responder", portalSin.skip && portalSin.category === "automated");
  check("filtro: los portales no se descartan por 'lista'", !prefilter(h({ from: "no-reply@argenprop.com", replyTo: "c@x.com", listUnsubscribe: "<mailto:u@argenprop.com>" }), ctx).skip);
  check("filtro: sin remitente válido", skipCat({ from: "sin arroba" }) === "other");
  check("responder: usa Reply-To si existe", replyAddress({ from: "no-reply@zonaprop.com.ar", replyTo: "Cliente <cliente@gmail.com>" }) === "cliente@gmail.com" && replyAddress({ from: "Ana <ana@x.com>" }) === "ana@x.com");
  check("saludo: toma el primer nombre", firstNameOf("Juan Pérez") === "Juan" && firstNameOf("MARÍA JOSÉ") === "María");
  check("saludo: ignora emails, enlaces y nombres genéricos", firstNameOf("juan@x.com") === null && firstNameOf("https://evil.com Ana") === "Ana" && firstNameOf("info") === null && firstNameOf("") === null && firstNameOf(null) === null);
  check("saludo: no deja pasar saltos de línea ni encabezados", firstNameOf("Juan\nBcc: a@b.com") === "Juan" && !/[\r\n<>@]/.test(firstNameOf("Ana\r\nSubject: x <a@b.com>") ?? ""));
}

// ── Clasificación: mails de ejemplo ─────────────────────────────────────────
{
  type Case = { name: string; subject?: string; text: string; ref?: boolean; hits?: boolean; portal?: boolean; expect: string; human?: string[]; minConf?: number };
  const cases: Case[] = [
    { name: "disponibilidad con enlace", subject: "Casa en Canning", text: "Hola, ¿sigue disponible la casa de Canning? Gracias", ref: true, expect: "availability", minConf: 0.75 },
    { name: "disponibilidad sin enlace", text: "Buenas tardes, ¿todavía está en venta el departamento de Palermo?", expect: "availability" },
    { name: "se alquila todavía", text: "¿Se alquila todavía el PH de La Plata?", ref: true, expect: "availability" },
    { name: "precio", text: "Buenas, ¿cuánto sale el departamento? ¿Y las expensas?", ref: true, expect: "price", minConf: 0.75 },
    { name: "valor", text: "Quisiera saber el valor de la propiedad", ref: true, expect: "price" },
    { name: "características", text: "Quería saber cuántos ambientes tiene y si tiene cochera y balcón", ref: true, expect: "features" },
    { name: "características 2", text: "¿Tiene pileta? ¿Cuántos dormitorios y baños?", ref: true, expect: "features" },
    { name: "visita", text: "Me gustaría visitarla este sábado, ¿se puede coordinar?", ref: true, expect: "visit", minConf: 0.75 },
    { name: "visita 2", text: "¿Cuándo puedo ir a verla?", ref: true, expect: "visit" },
    { name: "consulta general", text: "Hola, me interesa la propiedad, quisiera más información", ref: true, expect: "general" },
    { name: "portal", subject: "Consulta sobre tu propiedad", text: "Nombre: Juan\nMensaje: ¿Sigue disponible?", portal: true, expect: "availability", minConf: 0.75 },
    { name: "portal sin pregunta clara", text: "Hola, quiero que me contacten.", portal: true, expect: "general" },
    { name: "varias preguntas", text: "¿Sigue disponible? ¿Cuánto sale? Quisiera visitarla", ref: true, expect: "availability" },
    { name: "financiación", text: "¿Cuánto sale el departamento? ¿Aceptan crédito hipotecario o financiación?", ref: true, expect: "price", human: ["financiación"] },
    { name: "permuta", text: "Me interesa la casa, ¿aceptan permuta por un departamento?", ref: true, expect: "general", human: ["permuta"] },
    { name: "mascotas", text: "¿Tiene cochera? ¿Aceptan mascotas?", ref: true, expect: "features", human: ["mascotas"] },
    { name: "garantía", text: "Quiero alquilarlo, ¿qué garantía piden? ¿Sigue disponible?", ref: true, expect: "availability", human: ["requisitos del alquiler"] },
    { name: "negociación", text: "¿El precio es negociable? ¿Cuánto sale?", ref: true, expect: "price", human: ["negociación del precio"] },
    { name: "reclamo", text: "Tengo una queja: voy a hablar con mi abogado por la propiedad que visité", ref: true, expect: "general", human: ["un reclamo"] },
    { name: "fuera de oficina", subject: "Respuesta automática", text: "Estaré fuera de la oficina hasta el lunes. Respuesta automática.", expect: "automated" },
    { name: "promoción", text: "Descuentos exclusivos en muebles. Para darse de baja haga clic aquí. Promoción imperdible", expect: "newsletter" },
    { name: "estafa", text: "¡Ganaste un premio! Verifica tu cuenta haciendo clic aquí ahora", expect: "spam" },
    { name: "rebote", subject: "Delivery Status Notification (Failure)", text: "El mensaje no se pudo entregar. Undeliverable.", expect: "bounce" },
    { name: "tasación (no es consulta)", text: "Tengo una casa para vender, ¿pueden tasarla?", expect: "other" },
    { name: "búsqueda sin enlace (plural: salen)", text: "Hola, ¿tienen departamentos en venta en Palermo? ¿Cuánto salen?", hits: true, expect: "price" },
    { name: "búsqueda sin precio", text: "Buenas tardes, estoy buscando una casa en alquiler en Tigre, ¿tienen algo?", hits: true, expect: "general" },
    { name: "menciona la zona pero no es una consulta", text: "Nos vemos el domingo en Palermo, llevo las medialunas", hits: true, expect: "other" },
    { name: "saludo corto", text: "Hola", expect: "other" },
    { name: "agradecimiento", text: "Gracias por la información!", expect: "other" },
    { name: "mail personal", text: "Nos vemos el domingo en el asado, llevo el vino.", expect: "other" },
  ];
  for (const c of cases) {
    const r = classifyMail({ subject: c.subject ?? "", text: c.text, hasPropertyRef: !!c.ref, searchHits: c.hits, portal: c.portal });
    check(`clasifica: ${c.name} → ${c.expect}`, r.category === c.expect, { got: r.category, conf: r.confidence, topics: r.topics, reasons: r.reasons });
    if (c.human) check(`clasifica: ${c.name} → necesita a una persona (${c.human.join(", ")})`, r.needsHuman && c.human.every((h) => r.humanTopics.includes(h)), r.humanTopics);
    else if (!["spam", "newsletter", "bounce", "automated", "other"].includes(c.expect)) check(`clasifica: ${c.name} → no necesita a una persona`, !r.needsHuman, r.humanTopics);
    if (c.minConf) check(`clasifica: ${c.name} → confianza ≥ ${c.minConf}`, r.confidence >= c.minConf, r.confidence);
  }
  const multi = classifyMail({ subject: "", text: "¿Sigue disponible? ¿Cuánto sale? Quisiera visitarla", hasPropertyRef: true });
  check("clasifica: junta todos los temas que toca", ["availability", "price", "visit"].every((t) => multi.topics.includes(t as never)), multi.topics);
  const noise = classifyMail({ subject: "", text: "Hola, pasó algo con la propiedad", hasPropertyRef: false });
  check("clasifica: sin señales claras y sin propiedad → no es consulta", noise.category === "other");
  const reasons = classifyMail({ subject: "", text: "¿Sigue disponible?", hasPropertyRef: true });
  check("clasifica: explica por qué", reasons.reasons.length >= 2 && reasons.reasons.some((x) => /nombra una de tus propiedades/.test(x)), reasons.reasons);
  const longSpam = classifyMail({ subject: "", text: "Consulta: ¿cuánto sale? " + "Ganaste un premio, clic aquí. ".repeat(3), hasPropertyRef: false });
  check("clasifica: el engaño le gana a una pregunta suelta", longSpam.category === "spam", longSpam);
}

// ── Enlaces a nuestras fichas ───────────────────────────────────────────────
{
  const hosts = ["recorrr.example", "www.otro.com"];
  const text = "Vi esta: https://recorrr.example/propiedades/casa-en-canning-abc123 y esta http://www.recorrr.example/propiedades/ph-la-plata-xyz789, también https://otro.com/propiedades/depto-1234 y https://evil.com/propiedades/casa-falsa-999 .";
  const slugs = extractSlugs(text, hosts);
  check("enlaces: reconoce los hosts propios (con o sin www)", slugs.join() === "casa-en-canning-abc123,ph-la-plata-xyz789,depto-1234", slugs);
  check("enlaces: ignora hosts ajenos", !slugs.some((s) => s.includes("falsa")));
  check("enlaces: sin repetir y con tope", extractSlugs("https://recorrr.example/propiedades/aaa-111 https://recorrr.example/propiedades/aaa-111", hosts).length === 1 && extractSlugs(Array.from({ length: 9 }, (_, i) => `https://recorrr.example/propiedades/casa-${i}${i}${i}`).join(" "), hosts, 5).length === 5);
  check("enlaces: un host parecido NO cuenta", extractSlugs("https://recorrr.example.evil.com/propiedades/casa-111", hosts).length === 0 && extractSlugs("https://evilrecorrr.example/propiedades/casa-111", hosts).length === 0);
}

// ── Redacción de la respuesta ───────────────────────────────────────────────
{
  const facts = (over: Partial<PropertyFacts> = {}): PropertyFacts => ({
    id: "p".repeat(24),
    slug: "casa-en-canning-abc123",
    title: "Casa en Canning",
    description: "Casa luminosa con jardín y pileta. Muy buen estado.",
    type: "casa",
    operation: "venta",
    price: { amount: 210_000, currency: "USD", expenses: 0, period: "total" },
    neighborhood: "Canning",
    city: "Ezeiza",
    rooms: 5,
    bedrooms: 3,
    bathrooms: 2,
    garages: 2,
    coveredArea: 220,
    totalArea: 600,
    amenities: ["pileta", "cochera"],
    hasTour: true,
    hasAmbient: false,
    videoCount: 0,
    ...over,
  });
  const prop = (over: Partial<PropertyFacts> = {}, url: string | null = "https://recorrr.example/propiedades/casa-en-canning-abc123"): ReplyProperty => ({ facts: facts(over), url });
  const base: ComposeInput = {
    fromName: "Juan Pérez",
    subject: "Casa en Canning",
    classification: { topics: ["availability"], category: "availability", needsHuman: false, humanTopics: [] },
    properties: [prop()],
    unavailable: false,
    alternatives: [],
    settings: { signature: "", greeting: "", closing: "", disclose: true, maxProperties: 3 },
    agencyName: "Umbral Norte Propiedades",
    seed: "msg-1",
    auto: false,
  };
  const r = composeReply(base);
  check("respuesta: saluda por el nombre y firma con la inmobiliaria", r.body.startsWith("Hola Juan,") && r.body.trimEnd().endsWith("Equipo de Umbral Norte Propiedades"), r.body);
  check("respuesta: usa los datos reales de la propiedad", /Casa en Canning/.test(r.body) && /210\.000/.test(r.body) && /Canning/.test(r.body) && /5 ambientes/.test(r.body), r.body);
  check("respuesta: incluye el enlace a la ficha", r.body.includes("https://recorrr.example/propiedades/casa-en-canning-abc123"));
  check("respuesta: disponibilidad → 'sigue disponible'", /sigue disponible/.test(r.body), r.body);
  check("respuesta: en confirmación NO lleva el aviso de asistente", !/asistente autom/.test(r.body));
  const auto = composeReply({ ...base, auto: true });
  check("respuesta: automática → avisa que la preparó un asistente", /asistente automático de Umbral Norte Propiedades/.test(auto.body));
  check("respuesta: automática con aviso apagado → sin aviso", !/asistente autom/.test(composeReply({ ...base, auto: true, settings: { ...base.settings, disclose: false } }).body));
  check("respuesta: sin enlace público no inventa uno", !/https?:\/\//.test(composeReply({ ...base, properties: [prop({}, null)] }).body));
  check("respuesta: sin nombre válido → 'Hola,'", composeReply({ ...base, fromName: "juan@x.com" }).body.startsWith("Hola,\n"));
  check("respuesta: voseo (no 'tú')", !/\b(tienes|puedes|quieres|cuéntame)\b/i.test(r.body), r.body);
  check("respuesta: es determinista con la misma semilla", composeReply(base).body === r.body);
  const variants = new Set(Array.from({ length: 12 }, (_, i) => composeReply({ ...base, seed: `m${i}` }).body));
  check("respuesta: varía las frases entre mails", variants.size >= 3, variants.size);
  const many = composeReply({ ...base, properties: [prop({ id: "1".repeat(24), title: "Casa Uno" }), prop({ id: "2".repeat(24), title: "Casa Dos" }), prop({ id: "3".repeat(24), title: "Casa Tres" }), prop({ id: "4".repeat(24), title: "Casa Cuatro" })], settings: { ...base.settings, maxProperties: 2 } });
  check("respuesta: respeta el máximo de propiedades", (many.body.match(/^• /gm) ?? []).length === 2 && !/Casa Tres/.test(many.body), many.body);
  const price = composeReply({ ...base, classification: { topics: ["price"], category: "price", needsHuman: false, humanTopics: [] }, properties: [prop({ operation: "alquiler", price: { amount: 850_000, currency: "ARS", expenses: 120_000, period: "mensual" } })] });
  check("respuesta: precio de alquiler con 'por mes' y expensas", /850\.000 por mes/.test(price.body) && /120\.000 de expensas/.test(price.body), price.body);
  const feat = composeReply({ ...base, classification: { topics: ["features"], category: "features", needsHuman: false, humanTopics: [] } });
  check("respuesta: características → trae el detalle (ambientes, baños, cochera)", /Datos:/.test(feat.body) && /Baños: 2/.test(feat.body) && /Cocheras: 2/.test(feat.body), feat.body);
  const visit = composeReply({ ...base, classification: { topics: ["visit"], category: "visit", needsHuman: false, humanTopics: [] } });
  check("respuesta: visita → pide días y horarios, sin prometer uno", /Contanos qué días y horarios/.test(visit.body) && !/\b\d{1,2}:\d{2}\b/.test(visit.body), visit.body);
  const human = composeReply({ ...base, classification: { topics: ["price"], category: "price", needsHuman: true, humanTopics: ["financiación", "mascotas"] } });
  check("respuesta: lo que no puede contestar lo deriva a una persona", /Sobre financiación y mascotas, te lo confirmamos a la brevedad/.test(human.body), human.body);
  const none = composeReply({ ...base, properties: [], alternatives: [] });
  check("respuesta: sin propiedad identificada pregunta cuál", /¿nos contás cuál propiedad te interesó/.test(none.body));
  const gone = composeReply({ ...base, properties: [], unavailable: true, alternatives: [prop({ id: "9".repeat(24), title: "Casa Parecida" })] });
  check("respuesta: propiedad que ya no está → lo dice y ofrece parecidas", /ya no está disponible/.test(gone.body) && /Casa Parecida/.test(gone.body), gone.body);
  const search = composeReply({ ...base, properties: [], alternatives: [prop({ id: "8".repeat(24), title: "Casa Sugerida" })] });
  check("respuesta: sin nombrar propiedad pero con búsqueda → sugiere", /pueden interesarte|te sugerimos/.test(search.body) && /Casa Sugerida/.test(search.body), search.body);
  const custom = composeReply({ ...base, settings: { signature: "Lucía — Umbral", greeting: "¡Gracias por escribir!", closing: "Un abrazo.", disclose: true, maxProperties: 3 } });
  check("respuesta: usa saludo, cierre y firma configurados", custom.body.includes("¡Gracias por escribir!") && custom.body.includes("Un abrazo.") && custom.body.trimEnd().endsWith("Lucía — Umbral"), custom.body);
  check("asunto: 'Re:' sin repetir", replySubject("RE: Re: Casa en Canning") === "Re: Casa en Canning" && replySubject("Fwd: Hola") === "Re: Hola");
  check("asunto: sin saltos de línea (no se pueden inyectar encabezados)", !/[\r\n]/.test(replySubject("Hola\r\nBcc: victima@x.com")) && replySubject("Hola\r\nBcc: v@x.com") === "Re: Hola Bcc: v@x.com");
  check("asunto: vacío o muy largo", replySubject("") === "Re: Tu consulta" && replySubject(null) === "Re: Tu consulta" && replySubject("x".repeat(500)).length <= 154);
  const attack = composeReply({ ...base, fromName: "Ana\nBcc: x@y.com <script>", subject: "Hola\r\nBcc: a@b.com" });
  check("respuesta: ni el nombre ni el asunto del remitente inyectan encabezados", !/\nBcc:/i.test(attack.body) && !/[\r\n]/.test(attack.subject) && !/<script>/.test(attack.body), attack);
}

// ── Decisión automática ─────────────────────────────────────────────────────
{
  const noon = new Date("2026-10-25T15:00:00Z"); // 12:00 en Argentina
  const night = new Date("2026-10-25T02:00:00Z"); // 23:00 del día anterior en Argentina
  const ok: AutoInput = {
    settings: { mode: "auto", autoCategories: ["availability", "price", "features", "general"], autoPerDay: 20, schedule: { enabled: false, from: "09:00", to: "20:00" } },
    category: "availability",
    confidence: 0.9,
    needsHuman: false,
    authFailed: false,
    replyElsewhere: false,
    availableProperties: 1,
    sentToday: 0,
    senderRepliedRecently: false,
    threadAnswered: false,
    now: noon,
  };
  check("auto: con todo en orden, sale sola", decideAuto(ok).auto);
  const held = (patch: Partial<AutoInput>, settings: Partial<AutoInput["settings"]> = {}) => !decideAuto({ ...ok, ...patch, settings: { ...ok.settings, ...settings } }).auto;
  check("auto: en modo confirmación no sale sola", held({}, { mode: "confirm" }));
  check("auto: una categoría no permitida se confirma (visita)", held({ category: "visit" }));
  check("auto: confianza baja → confirmar", held({ confidence: 0.74 }) && !held({ confidence: 0.75 }));
  check("auto: si hay algo para una persona → confirmar", held({ needsHuman: true }));
  check("auto: remitente que falla SPF/DKIM/DMARC → confirmar", held({ authFailed: true }));
  check("auto: Reply-To a otra dirección → confirmar (no se puede usar para mandar mails a un tercero)", held({ replyElsewhere: true }));
  check("auto: sin propiedad identificada → confirmar", held({ availableProperties: 0 }));
  check("auto: tope diario", held({ sentToday: 20 }) && !held({ sentToday: 19 }));
  check("auto: a la misma persona no se le responde dos veces en un día", held({ senderRepliedRecently: true }));
  check("auto: ni dos veces en el mismo hilo", held({ threadAnswered: true }));
  const sched = { enabled: true, from: "09:00", to: "20:00" };
  check("auto: horario → dentro sale, fuera se confirma", !held({}, { schedule: sched }) && held({ now: night }, { schedule: sched }));
  check("auto: horario que cruza la medianoche", !held({ now: night }, { schedule: { enabled: true, from: "22:00", to: "06:00" } }) && held({}, { schedule: { enabled: true, from: "22:00", to: "06:00" } }));
  check("hora: se lee en Argentina", argentinaClock(noon) === "12:00" && argentinaClock(night) === "23:00", [argentinaClock(noon), argentinaClock(night)]);
  check("hora: horarios mal escritos nunca habilitan", !inSchedule(noon, "9", "20") && !inSchedule(noon, "09:00", "xx"));
  check("auto: dice por qué se confirma", /confirmaci/i.test(decideAuto({ ...ok, settings: { ...ok.settings, mode: "confirm" } }).why) && /una persona/i.test(decideAuto({ ...ok, needsHuman: true }).why));
}

hosts().then(() => {
  console.log(`\n${total - failed}/${total} pruebas correctas`);
  process.exit(failed > 0 ? 1 : 0);
});
