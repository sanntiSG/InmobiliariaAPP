/**
 * Pruebas del agente de correo — sin base de datos ni red: cifrado de credenciales, clave del cron, defensa contra SSRF,
 * limpieza de mails, filtros, clasificación (con mails de ejemplo en castellano), redacción de respuestas y decisiones del
 * modo automático. Correr con `npm run mail:check`: sale con código 1 si alguna falla.
 */
import { createSecretBox, SecretBoxError, mailboxAad } from "../src/lib/security/secret-box";
import { cronSecrets, sweepSecrets, verifyCronRequest } from "../src/lib/security/cron-auth";
import { CRON_TOKEN_LABEL, SWEEP_TOKEN_LABEL, deriveCronToken, deriveSweepToken } from "../src/lib/security/cron-token";
import { sweepEnabled } from "../src/lib/cron/runtime";
import { mailRuntime } from "../src/lib/mail/runtime";
import { POLL_EVERY_MS, SCHEDULE_SLACK_MS, dueFilter, isDue, nextAutoCheckAt } from "../src/lib/mail/schedule";
import { explain, MailTransportError, parseAuth } from "../src/lib/mail/transport";
import { getPublicSiteUrl, publicSiteUrl, siteHosts } from "../src/lib/mail/site";
import { assertSafeMailHost, HostError, isPrivateIp } from "../src/lib/mail/hosts";
import { cleanBody, htmlToText } from "../src/lib/mail/clean";
import { firstNameOf, prefilter, replyAddress, type MailHeaders } from "../src/lib/mail/prefilter";
import { classifyMail, needsHardHuman, SOFT_HUMAN_TOPICS } from "../src/lib/mail/classify";
import { attentionNotice, isClosingReason, needsAttention, quotesAutoFooter, type AttentionInput } from "../src/lib/mail/attention";
import { cleanFollowUp, followUpStarter, FOLLOWUP_LIMITS } from "../src/lib/mail/followup";
import { parseSocial, socialLinks, type SocialNetwork } from "../src/lib/validation/social";
import { FALLBACK_ACCENT, buildOutgoing, mailLogoUrl, readableOn, safeHex, signatureHtml, signatureText, textToHtml, type SignatureAgency } from "../src/lib/mail/signature";
import { extractSlugs } from "../src/lib/mail/refs";
import { composeReply, replySubject, type ComposeInput, type ReplyProperty } from "../src/lib/mail/compose";
import { AUTO_MIN_CONFIDENCE, argentinaClock, decideAuto, inSchedule, type AutoInput } from "../src/lib/mail/decide";
import { PRESETS, appPasswordName, presetFor, providerFromEmail, smtpImplicitTls } from "../src/lib/mail/presets";
import { buildSample } from "../src/lib/mail/preview";
import { CORPUS, THRESHOLDS, classifySample, runCorpus } from "./mail-corpus";
import { propertyUrl } from "../src/lib/mail/analyze";
import { stripAccents } from "../src/lib/advisor/nlu/normalize";
import { DISMISS_MIN_SIMILARITY, LIFT_MIN_SIMILARITY, applyMailLessons, mailFingerprint, type MailLessons } from "../src/lib/mail/lessons";
import { detectAsks, soundsLikeQuestion } from "../src/lib/agents/knowledge/asks";
import { answerAsks } from "../src/lib/agents/knowledge/answers";
import { readRequest } from "../src/lib/mail/signals";
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

  // Las demás tareas programadas (`/api/cron/sweep`) tienen su propia clave, derivada de AUTH_SECRET: no dependen del correo.
  const auth = Buffer.alloc(32, 5).toString("base64");
  const sweep = deriveSweepToken(auth);
  check("sweep-token: determinista, hexadecimal, no contiene el secreto y no es el del correo ni el secreto", sweep === deriveSweepToken(auth) && /^[0-9a-f]{64}$/.test(sweep) && !sweep.includes(auth) && sweep !== auth && sweep !== deriveCronToken(auth) && (SWEEP_TOKEN_LABEL as string) !== CRON_TOKEN_LABEL);
  check("sweepSecrets: con AUTH_SECRET alcanza (sin clave del correo)", sweepSecrets({ AUTH_SECRET: auth }).join() === sweep, sweepSecrets({ AUTH_SECRET: auth }));
  check("sweepSecrets: un AUTH_SECRET corto no aporta nada", sweepSecrets({ AUTH_SECRET: "corto" }).length === 0 && sweepSecrets({}).length === 0);
  check("sweepSecrets: sigue aceptando la clave del correo y CRON_SECRET (lo ya publicado no se rompe)", sweepSecrets({ AUTH_SECRET: auth, MAIL_CREDENTIALS_KEY: key, CRON_SECRET: secret }).length === 3 && verifyCronRequest(req(`Bearer ${token}`), sweepSecrets({ MAIL_CREDENTIALS_KEY: key })));
  check("sweep: la clave del sweep pasa en el sweep y NO en la revisión del correo", verifyCronRequest(req(`Bearer ${sweep}`), sweepSecrets({ AUTH_SECRET: auth })) && !verifyCronRequest(req(`Bearer ${sweep}`), cronSecrets({ AUTH_SECRET: auth, MAIL_CREDENTIALS_KEY: key })));
  check("sweep: el secreto de sesiones en crudo no pasa", !verifyCronRequest(req(`Bearer ${auth}`), sweepSecrets({ AUTH_SECRET: auth })));
  check("sweepEnabled: la principal sí (sin clave del correo), Render no, y se puede forzar", sweepEnabled({}) && !sweepEnabled({ RENDER: "true" }) && sweepEnabled({ RENDER: "true", SWEEP_ENABLED: "true" }) && !sweepEnabled({ SWEEP_ENABLED: "false" }));
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

// ── Cuándo toca revisar un buzón (el cron no debe saltearse pasadas) ─────────
{
  const MIN = 60_000;
  const t0 = Date.UTC(2026, 9, 26, 22, 50, 0);
  // El caso real: la función cae unos segundos después del minuto; la revisión agenda "+5 min desde que empezó".
  const polledAt = t0 + 13_229;
  const nextPollAt = new Date(polledAt + POLL_EVERY_MS);
  const nextTick = t0 + 5 * MIN;
  check("agenda: la próxima pasada llega ANTES de la hora agendada (el caso del bug)", nextTick < nextPollAt.getTime());
  check("agenda: con el margen, esa pasada sí revisa el buzón", isDue(nextPollAt, nextTick) && isDue(nextPollAt, nextTick + 2_000));
  // Barrido: cualquier combinación de demoras entre 0 y 60 s en dos pasadas seguidas tiene que revisar.
  let skipped = 0;
  let wouldSkipBefore = 0;
  for (let first = 0; first <= 60_000; first += 3_000) {
    for (let second = 0; second <= 60_000; second += 3_000) {
      const agendada = t0 + first + POLL_EVERY_MS;
      const llegada = t0 + 5 * MIN + second;
      if (!isDue(agendada, llegada)) skipped++;
      if (!(agendada <= llegada)) wouldSkipBefore++;
    }
  }
  check("agenda: con demoras de 0 a 60 s entre pasadas no se saltea ninguna", skipped === 0, { skipped });
  check("agenda: (control) sin margen el bug se reproduce", wouldSkipBefore > 0, { wouldSkipBefore });
  check("agenda: un buzón revisado recién (hace 30 s) no vuelve a tocar", !isDue(new Date(t0 + 30_000 + POLL_EVERY_MS), t0 + 60_000));
  check("agenda: la espera por error (15 min) se respeta", !isDue(new Date(t0 + 15 * MIN), t0 + 5 * MIN) && !isDue(new Date(t0 + 15 * MIN), t0 + 13 * MIN));
  check("agenda: recién conectado (sin fecha) toca de inmediato", isDue(null, t0) && isDue(undefined, t0));
  check("agenda: el margen es menor que el período (no se revisa de más)", SCHEDULE_SLACK_MS < POLL_EVERY_MS);

  const f = dueFilter(t0);
  check("agenda: el filtro de Mongo toma activos y con error", JSON.stringify(f.status) === JSON.stringify({ $in: ["active", "error"] }), f.status);
  check("agenda: el filtro incluye 'sin fecha' y 'vence dentro del margen'", f.$or.length === 2 && f.$or[0]!.nextPollAt === null && f.$or[1]!.nextPollAt!.$lte.getTime() === t0 + SCHEDULE_SLACK_MS, f.$or);
  check("agenda: el filtro deja afuera lo que está bloqueado", f.lockedUntil.$not.$gt.getTime() === t0, f.lockedUntil);

  // Estimación para mostrar en pantalla.
  const clock = Date.UTC(2026, 9, 26, 22, 52, 0);
  check("próxima revisión: la siguiente pasada del reloj (múltiplo de 5 min)", nextAutoCheckAt(nextPollAt, clock) === t0 + 5 * MIN, new Date(nextAutoCheckAt(nextPollAt, clock)).toISOString());
  check("próxima revisión: si ya venció, la próxima pasada", nextAutoCheckAt(new Date(t0), clock) === t0 + 5 * MIN);
  check("próxima revisión: si espera por un error, manda la espera", nextAutoCheckAt(new Date(t0 + 17 * MIN + 13_000), clock) === t0 + 20 * MIN, new Date(nextAutoCheckAt(new Date(t0 + 17 * MIN + 13_000), clock)).toISOString());
  check("próxima revisión: sin fecha, la próxima pasada", nextAutoCheckAt(null, clock) === t0 + 5 * MIN);
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

// ── "Probá cómo respondería": la consulta de ejemplo tiene que funcionar de verdad ─────
{
  const url = propertyUrl("https://sitio.example", "casa-en-canning-abc123");
  check("preview: el enlace a la ficha sale del sitio y del slug", url === "https://sitio.example/propiedades/casa-en-canning-abc123" && propertyUrl(null, "x") === null, url);
  const withUrl = buildSample({ title: "Casa en Canning", url });
  const noUrl = buildSample({ title: "Casa en Canning", url: null });
  check("preview: el ejemplo nombra la propiedad y trae el enlace", withUrl.subject.includes("Casa en Canning") && withUrl.text.includes("https://sitio.example/propiedades/casa-en-canning-abc123"), withUrl);
  check("preview: sin dirección pública, el ejemplo nombra sólo el título", noUrl.text.includes("Casa en Canning") && !noUrl.text.includes("http"), noUrl);
  check("preview: el enlace del ejemplo se reconoce como una propiedad de la inmobiliaria", extractSlugs(withUrl.text, ["sitio.example"]).join() === "casa-en-canning-abc123", extractSlugs(withUrl.text, ["sitio.example"]));
  const cls = classifyMail({ subject: withUrl.subject, text: cleanBody(withUrl.text), hasPropertyRef: true });
  check("preview: el ejemplo se entiende como una consulta y no queda para una persona", ["availability", "price", "visit", "general", "features"].includes(cls.category) && !cls.needsHuman && cls.confidence >= 0.6, cls);
  check("preview: lo que se manda a la simulación no puede traer saltos en el asunto", !/[\r\n]/.test(withUrl.subject));
}

// ── Nombre de la contraseña de aplicación (identifica a cada inmobiliaria) ─────
{
  check("clave: lleva el nombre de la inmobiliaria", appPasswordName("Inmobiliaria SS") === "Recorrr - Inmobiliaria SS", appPasswordName("Inmobiliaria SS"));
  check("clave: conserva tildes y ñ", appPasswordName("Río Bienes Raíces") === "Recorrr - Río Bienes Raíces" && appPasswordName("Muñoz & Hijos") === "Recorrr - Muñoz & Hijos");
  check("clave: saca símbolos raros (etiquetas, comillas, emojis)", !/[<>"`$]/.test(appPasswordName('Casa <b>"Sol"</b> $$')) && appPasswordName("Casa \u{1F3E0} Sol").includes("Casa") && !/\p{Extended_Pictographic}/u.test(appPasswordName("Casa \u{1F3E0} Sol")), appPasswordName('Casa <b>"Sol"</b> $$'));
  check("clave: no pasa de 40 caracteres ni termina con espacio", appPasswordName("Una Inmobiliaria con un nombre larguísimo que no entra entero").length <= 40 && !appPasswordName("Una Inmobiliaria con un nombre larguísimo que no entra entero").endsWith(" "));
  check("clave: sin nombre queda 'Recorrr'", appPasswordName("") === "Recorrr" && appPasswordName(null) === "Recorrr" && appPasswordName("   ") === "Recorrr");
  check("clave: cada proveedor pide ponerle ese nombre en un paso", (["gmail", "yahoo", "icloud"] as const).every((id) => PRESETS[id].steps.filter((s) => s.text.includes("{nombre}")).length === 1));
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
    { name: "quiere vender o tasar (lo atiende una persona)", text: "Tengo una casa para vender, ¿pueden tasarla?", expect: "general", human: ["tasación o venta de su propiedad"] },
    { name: "búsqueda sin enlace (plural: salen)", text: "Hola, ¿tienen departamentos en venta en Palermo? ¿Cuánto salen?", hits: true, expect: "price" },
    { name: "búsqueda sin precio", text: "Buenas tardes, estoy buscando una casa en alquiler en Tigre, ¿tienen algo?", hits: true, expect: "general" },
    { name: "menciona la zona pero no es una consulta", text: "Nos vemos el domingo en Palermo, llevo las medialunas", hits: true, expect: "other" },
    { name: "'oferta de' suelta no es negociar el precio", text: "Hola, vi su oferta de departamentos en Palermo. ¿Sigue disponible el de Palermo?", ref: true, expect: "availability" },
    { name: "'banco' sin pedir financiación", text: "Trabajo en un banco y quisiera visitar la casa de Alan este sábado, ¿se puede?", ref: true, expect: "general" },
    { name: "un apellido que termina en 'gatos' no son mascotas", text: "Hola, ¿cuánto sale la casa? Saludos, Pegatos", ref: true, expect: "price" },
    { name: "hacer una oferta sí es negociar", text: "¿Puedo hacer una oferta por la casa? ¿Sigue disponible?", ref: true, expect: "availability", human: ["negociación del precio"] },
    { name: "crédito de un banco sí es financiación", text: "¿Aceptan crédito del Banco Nación? ¿Sigue disponible?", ref: true, expect: "availability", human: ["financiación"] },
    { name: "perros sí son mascotas", text: "Tengo dos perros, ¿puedo vivir ahí? ¿Sigue disponible?", ref: true, expect: "availability", human: ["mascotas"] },
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
  check("clasifica: algo dudoso del rubro de una persona → se deja para revisar, no se tira", noise.category === "general" && noise.uncertain && noise.needsHuman && noise.confidence < 0.6, noise);
  const reasons = classifyMail({ subject: "", text: "¿Sigue disponible?", hasPropertyRef: true });
  check("clasifica: explica por qué", reasons.reasons.length >= 2 && reasons.reasons.some((x) => /nombra una de tus propiedades/.test(x)), reasons.reasons);
  const longSpam = classifyMail({ subject: "", text: "Consulta: ¿cuánto sale? " + "Ganaste un premio, clic aquí. ".repeat(3), hasPropertyRef: false });
  check("clasifica: el engaño le gana a una pregunta suelta", longSpam.category === "spam", longSpam);
}

// ── Banco de mails: qué tanto entiende (ver scripts/mail-corpus.ts) ───────────
{
  const r = runCorpus();
  const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
  const detail = (rows: { s: { s?: string; t: string }; outcome: string }[]) => rows.slice(0, 6).map((x) => `${x.s.s ? `[${x.s.s}] ` : ""}${x.s.t.slice(0, 70)} → ${x.outcome}`);
  check(`corpus (${r.total} mails): entiende al menos ${pct(THRESHOLDS.inquiryRecall)} de las consultas (hoy ${pct(r.inquiryRecall)})`, r.inquiryRecall >= THRESHOLDS.inquiryRecall, detail(r.missedInquiries));
  check(`corpus: al menos ${pct(THRESHOLDS.clearRecall)} de las consultas claras salen como claras (hoy ${pct(r.clearRecall)})`, r.clearRecall >= THRESHOLDS.clearRecall, detail(r.notClear));
  check(`corpus: descarta al menos ${pct(THRESHOLDS.noiseRejected)} de lo que no es consulta (hoy ${pct(r.noiseRejected)})`, r.noiseRejected >= THRESHOLDS.noiseRejected, detail(r.falseAlarms));
  check("corpus: ninguna consulta con palabras del rubro se descarta en silencio", r.missedInquiries.length === 0, detail(r.missedInquiries));
  check(
    `corpus: reconoce qué temas tiene que contestar una persona en al menos ${pct(THRESHOLDS.humanTopics)} de ${r.humanTopicsTotal} consultas anotadas (hoy ${pct(r.humanTopics)})`,
    r.humanTopics >= THRESHOLDS.humanTopics,
    r.humanTopicsMisses.slice(0, 6).map((x) => `${x.s.t.slice(0, 70)} → esperaba [${(x.s.h ?? []).join(", ")}], dio [${x.humanTopics.join(", ")}]`)
  );

  // Los dos mails reales que se ignoraron en la primera prueba.
  const sol = classifySample({ l: "clear", s: "Casas en venta en Ezeiza", t: "" });
  check("real: 'Casas en venta en Ezeiza' (sólo asunto) es una consulta clara", sol.outcome === "clear" && sol.category === "general" && sol.reasons.some((x) => /casas en venta en Ezeiza/.test(x)), sol);
  check("real: la búsqueda se explica con lo que pidió", sol.reasons.join(" ").includes("busca casas en venta en Ezeiza"), sol.reasons);
  const fwd = classifySample({ l: "no", s: "Fwd: Casas en venta en ezeiza", t: "" });
  check("real: el mismo asunto reenviado también se entiende (lo ignora el prefiltro por ser de la propia casilla)", fwd.outcome === "clear");
  check("corpus: tiene variedad (≥ 150 mails)", CORPUS.length >= 150, CORPUS.length);
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
  check("respuesta: visita → pide días y horarios, sin prometer uno", /qué días y horarios/.test(visit.body) && !/\b\d{1,2}:\d{2}\b/.test(visit.body), visit.body);
  const human = composeReply({ ...base, classification: { topics: ["price"], category: "price", needsHuman: true, humanTopics: ["financiación", "mascotas"] } });
  check("respuesta: lo que no puede contestar lo deriva a una persona", /Sobre financiación y mascotas, te lo confirmamos a la brevedad/.test(human.body), human.body);
  const none = composeReply({ ...base, properties: [], alternatives: [] });
  check("respuesta: sin propiedad identificada pregunta cuál", /¿nos contás cuál propiedad te interesó/.test(none.body));
  const gone = composeReply({ ...base, properties: [], unavailable: true, alternatives: [prop({ id: "9".repeat(24), title: "Casa Parecida" })] });
  check("respuesta: propiedad que ya no está → lo dice y ofrece parecidas", /ya no está disponible/.test(gone.body) && /Casa Parecida/.test(gone.body), gone.body);
  const search = composeReply({ ...base, properties: [], alternatives: [prop({ id: "8".repeat(24), title: "Casa Sugerida" })] });
  check("respuesta: sin nombrar propiedad pero con búsqueda → sugiere", /pueden interesarte|te sugerimos/.test(search.body) && /Casa Sugerida/.test(search.body), search.body);
  // Variedad y limpieza en TODOS los caminos de la redacción, con muchas semillas.
  {
    const scenarios: [string, Partial<ComposeInput>][] = [
      ["disponible", {}],
      ["precio", { classification: { topics: ["price"], category: "price", needsHuman: false, humanTopics: [] } }],
      ["características", { classification: { topics: ["features"], category: "features", needsHuman: false, humanTopics: [] } }],
      ["visita", { classification: { topics: ["visit"], category: "visit", needsHuman: false, humanTopics: [] } }],
      ["general", { classification: { topics: ["general"], category: "general", needsHuman: false, humanTopics: [] } }],
      ["no está", { properties: [], unavailable: true, alternatives: [prop({ id: "9".repeat(24), title: "Casa Parecida" })] }],
      ["no está y no hay parecidas", { properties: [], unavailable: true, alternatives: [] }],
      ["sin nada publicado de lo que pidió", { properties: [], alternatives: [prop({ id: "8".repeat(24), title: "Casa Sugerida" })], search: { label: "casas en venta en Ezeiza", fallback: true } }],
      ["búsqueda con resultados", { properties: [], alternatives: [prop({ id: "8".repeat(24), title: "Casa Sugerida" })], search: { label: "casas en venta en Ezeiza", fallback: false } }],
      ["sugerencias sin búsqueda", { properties: [], alternatives: [prop({ id: "8".repeat(24), title: "Casa Sugerida" })] }],
      ["quiere vender", { properties: [], alternatives: [], classification: { topics: ["general"], category: "general", needsHuman: true, humanTopics: ["tasación o venta de su propiedad"] } }],
      ["pidió algo y no hay", { properties: [], alternatives: [], search: { label: "casas en venta en Ezeiza", fallback: false } }],
      ["sin datos", { properties: [], alternatives: [] }],
      ["con temas para una persona", { classification: { topics: ["price"], category: "price", needsHuman: true, humanTopics: ["financiación"] } }],
    ];
    let bad = "";
    const seen = new Map<string, Set<string>>();
    for (const [name, over] of scenarios) {
      for (let i = 0; i < 40; i++) {
        const out = composeReply({ ...base, ...over, seed: `mail-${i}`, auto: i % 2 === 0 }).body;
        seen.set(name, (seen.get(name) ?? new Set()).add(out));
        if (/undefined|NaN|\[object|\{\{|\$\{/.test(out)) bad = `${name}: marcador sin completar`;
        if (/\b(tienes|puedes|quieres|necesitas|cuéntame|escríbenos|llámanos)\b/i.test(out)) bad = `${name}: no usa voseo`;
        if (!/^Hola/.test(out) || !/Equipo de Umbral Norte Propiedades\s*(\n--[\s\S]*)?$/.test(out.trimEnd())) bad = `${name}: no saluda o no firma`;
        if ((out.match(/Gracias por/g) ?? []).length > 1) bad = `${name}: agradece dos veces`;
      }
    }
    check("respuesta: ningún camino deja marcadores sin completar, usa voseo, saluda y firma", bad === "", bad);
    const varied = [...seen].filter(([, v]) => v.size < 3).map(([n, v]) => `${n}: ${v.size}`);
    check("respuesta: cada camino tiene al menos 3 redacciones distintas", varied.length === 0, varied);
    const sameSeedTwice = scenarios.every(([, over]) => composeReply({ ...base, ...over, seed: "x1" }).body === composeReply({ ...base, ...over, seed: "x1" }).body);
    check("respuesta: con la misma semilla siempre sale igual", sameSeedTwice);
  }
  const custom = composeReply({ ...base, settings: { signature: "Lucía — Umbral", greeting: "¡Gracias por escribir!", closing: "Un abrazo.", disclose: true, maxProperties: 3 } });
  check("respuesta: usa saludo, cierre y firma configurados", custom.body.includes("¡Gracias por escribir!") && custom.body.includes("Un abrazo.") && custom.body.trimEnd().endsWith("Lucía — Umbral"), custom.body);
  check("asunto: 'Re:' sin repetir", replySubject("RE: Re: Casa en Canning") === "Re: Casa en Canning" && replySubject("Fwd: Hola") === "Re: Hola");
  check("asunto: sin saltos de línea (no se pueden inyectar encabezados)", !/[\r\n]/.test(replySubject("Hola\r\nBcc: victima@x.com")) && replySubject("Hola\r\nBcc: v@x.com") === "Re: Hola Bcc: v@x.com");
  check("asunto: vacío o muy largo", replySubject("") === "Re: Tu consulta" && replySubject(null) === "Re: Tu consulta" && replySubject("x".repeat(500)).length <= 154);
  const attack = composeReply({ ...base, fromName: "Ana\nBcc: x@y.com <script>", subject: "Hola\r\nBcc: a@b.com" });
  check("respuesta: ni el nombre ni el asunto del remitente inyectan encabezados", !/\nBcc:/i.test(attack.body) && !/[\r\n]/.test(attack.subject) && !/<script>/.test(attack.body), attack);
}

// ── Contestar lo que preguntan (preguntas puntuales y respuestas con datos reales) ─────────
{
  const asksOf = (text: string) => {
    const { slots } = readRequest("", text);
    return soundsLikeQuestion(text) ? detectAsks(stripAccents(text.toLowerCase()), slots.amenities) : [];
  };
  const kinds = (text: string) => asksOf(text).map((a) => (a.kind === "amenity" ? `amenity:${a.amenity}` : a.kind)).join(",");
  check("preguntas: comodidades", kinds("¿Tiene pileta y cochera?") === "amenity:pileta,amenity:cochera", kinds("¿Tiene pileta y cochera?"));
  check("preguntas: expensas y metros, en el orden en que aparecen", kinds("¿Cuánto son las expensas? ¿Y los metros cubiertos?") === "expenses,area", kinds("¿Cuánto son las expensas? ¿Y los metros cubiertos?"));
  check("preguntas: ambientes, dormitorios y baños", kinds("¿Cuántos ambientes, dormitorios y baños tiene?") === "bedrooms,bathrooms,rooms" || kinds("¿Cuántos ambientes, dormitorios y baños tiene?").split(",").sort().join() === "bathrooms,bedrooms,rooms", kinds("¿Cuántos ambientes, dormitorios y baños tiene?"));
  check("preguntas: mascotas y recorrido", kinds("¿Aceptan mascotas? ¿Tiene recorrido virtual?").includes("amenity:mascotas") && kinds("¿Aceptan mascotas? ¿Tiene recorrido virtual?").includes("tour"));
  check("preguntas: un mail que no pregunta no suma preguntas", asksOf("Gracias por la info. Mañana les aviso.").length === 0);
  check("preguntas: sin signo de pregunta también (\"quisiera saber si tiene pileta\")", kinds("Hola, quisiera saber si tiene pileta").includes("amenity:pileta"), kinds("Hola, quisiera saber si tiene pileta"));
  check("preguntas: reconoce lo que suena a pregunta", soundsLikeQuestion("¿Sigue?") && soundsLikeQuestion("Tiene cochera") && soundsLikeQuestion("cuanto sale") && !soundsLikeQuestion("Gracias, quedo atento."));

  const f = (over: Partial<PropertyFacts> = {}): PropertyFacts => ({
    id: "p".repeat(24),
    slug: "casa",
    title: "Casa en Canning",
    description: "",
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
    age: 12,
    floor: null,
    orientation: "Norte",
    amenities: ["pileta", "cochera", "mascotas"],
    hasTour: true,
    hasAmbient: false,
    videoCount: 0,
    ...over,
  });
  const say = (text: string, over: Partial<PropertyFacts> = {}) => answerAsks(f(over), asksOf(text));
  const a1 = say("¿Tiene pileta? ¿Y cochera?");
  check("respuestas: dice que sí con lo que figura (y cuenta las cocheras)", a1.sentences.join(" ") === "Sí, tiene pileta y 2 cocheras.", a1.sentences);
  const a2 = say("¿Tiene parrilla? ¿Y balcón?");
  check("respuestas: lo que no figura NO se afirma como 'no tiene'", a2.sentences.join(" ") === "En la publicación no figura parrilla ni balcón." && a2.missing === 2 && a2.known === 0, a2);
  const a3 = say("¿Tiene pileta y parrilla?");
  check("respuestas: mezcla lo que sí y lo que no figura", a3.sentences.join(" ") === "Sí, tiene pileta. En la publicación no figura parrilla." && a3.known === 1 && a3.missing === 1, a3);
  const a4 = say("¿Aceptan mascotas?");
  check("respuestas: mascotas con dato", a4.sentences.join(" ") === "Sí, acepta mascotas.", a4.sentences);
  check("respuestas: mascotas sin dato", say("¿Aceptan mascotas?", { amenities: [] }).sentences.join(" ") === "En la publicación no figura que acepte mascotas.");
  check("respuestas: expensas sin cargar", say("¿Cuánto son las expensas?").sentences.join(" ") === "En la publicación no figuran expensas." && say("¿Cuánto son las expensas?").missing === 1);
  check("respuestas: expensas con dato", /Las expensas son .*120\.000/.test(say("¿Cuánto son las expensas?", { price: { amount: 1, currency: "ARS", expenses: 120_000, period: "mensual" } }).sentences.join(" ")));
  check("respuestas: superficie cubierta y total", say("¿Cuántos metros tiene?").sentences.join(" ") === "Tiene 220 m² cubiertos y 600 m² totales.", say("¿Cuántos metros tiene?").sentences);
  check("respuestas: ambientes, dormitorios y baños", say("¿Cuántos dormitorios y baños?").sentences.join(" ") === "Tiene 3 dormitorios. Tiene 2 baños.", say("¿Cuántos dormitorios y baños?").sentences);
  check("respuestas: antigüedad, orientación y zona", say("¿Qué antigüedad tiene? ¿Qué orientación? ¿Dónde queda?").sentences.join(" ") === "Tiene 12 años de antigüedad. Su orientación es norte. Está en Canning, Ezeiza.", say("¿Qué antigüedad tiene? ¿Qué orientación? ¿Dónde queda?").sentences);
  check("respuestas: a estrenar", say("¿Qué antigüedad tiene?", { age: 0 }).sentences.join(" ") === "Es a estrenar.");
  check("respuestas: recorrido con y sin", /Sí, tiene recorrido 360°/.test(say("¿Tiene recorrido virtual?").sentences.join(" ")) && /no tiene recorrido 360°/.test(say("¿Tiene recorrido virtual?", { hasTour: false }).sentences.join(" ")));
  check("respuestas: sin preguntas no inventa nada", answerAsks(f(), []).sentences.length === 0);
  check("respuestas: una sola frase por tipo de pregunta", say("¿Tiene pileta? ¿Tiene cochera? ¿Y balcón?").sentences.length === 2, say("¿Tiene pileta? ¿Tiene cochera? ¿Y balcón?").sentences);

  // Dentro de la respuesta completa.
  const rp = (over: Partial<PropertyFacts> = {}): ReplyProperty => ({ facts: f(over), url: "https://recorrr.example/propiedades/casa" });
  const compose = (text: string, extra: Partial<ComposeInput> = {}, over: Partial<PropertyFacts> = {}) => {
    const set = answerAsks(f(over), asksOf(text));
    return composeReply({
      fromName: "Juan",
      subject: "Casa",
      classification: { topics: ["features"], category: "features", needsHuman: false, humanTopics: [] },
      properties: [rp(over)],
      unavailable: false,
      alternatives: [],
      settings: { signature: "", greeting: "", closing: "", disclose: true, maxProperties: 3 },
      agencyName: "Umbral",
      seed: "m1",
      auto: false,
      answers: [{ title: f(over).title, sentences: set.sentences, missing: set.missing }],
      ...extra,
    }).body;
  };
  const r1 = compose("¿Tiene pileta y parrilla?");
  check("redacción: responde la pregunta puntual", /Sí, tiene pileta\./.test(r1) && /no figura parrilla/.test(r1), r1);
  check("redacción: con respuesta puntual no vuelca todos los datos", !/Datos:/.test(r1) && /Casa en Canning/.test(r1), r1);
  check("redacción: avisa que lo que no figura se confirma con el equipo", /equipo/.test(r1) && /no figura parrilla/.test(r1), r1);
  const r2 = compose("¿Tiene pileta?");
  check("redacción: si todo figura, no promete confirmar nada", !/confirmamos con el equipo|consultamos con el equipo/.test(r2), r2);
  const r3 = compose("¿Tiene pileta? ¿Y cochera? ¿Cuántos baños?");
  check("redacción: varias frases van en viñetas", (r3.match(/^• /gm) ?? []).length >= 2 && /Sí, tiene pileta y 2 cocheras\./.test(r3), r3);
  const r4 = compose("¿Y tiene cochera?", { inherited: true });
  check("redacción: un seguimiento aclara de qué propiedad habla", /Casa en Canning/.test(r4) && /(consulta anterior|veníamos viendo)/.test(r4), r4);
  const r5 = compose("hola", { answers: [] });
  check("redacción: sin preguntas puntuales sigue trayendo el detalle de características", /Datos:/.test(r5), r5);
  const rv = compose("¿Tiene pileta?", { classification: { topics: ["availability"], category: "availability", needsHuman: false, humanTopics: [] } });
  check("redacción: disponibilidad + pregunta → dice las dos cosas", /sigue disponible/.test(rv) && /Sí, tiene pileta/.test(rv), rv);
  const two = composeReply({
    fromName: "Ana",
    subject: "Dos casas",
    classification: { topics: ["features"], category: "features", needsHuman: false, humanTopics: [] },
    properties: [rp({ title: "Casa Uno" }), rp({ title: "Casa Dos", id: "q".repeat(24), amenities: [] })],
    unavailable: false,
    alternatives: [],
    settings: { signature: "", greeting: "", closing: "", disclose: true, maxProperties: 3 },
    agencyName: "Umbral",
    seed: "m2",
    auto: false,
    answers: [
      { title: "Casa Uno", sentences: ["Sí, tiene pileta."], missing: 0 },
      { title: "Casa Dos", sentences: ["En la publicación no figura pileta."], missing: 1 },
    ],
  }).body;
  check("redacción: con varias propiedades contesta por cada una", /Sobre «Casa Uno»: Sí, tiene pileta\./.test(two) && /Sobre «Casa Dos»: En la publicación no figura pileta\./.test(two), two);
  check("redacción: lo que preguntó no se copia al revés (sin repetir sus palabras)", !/Tiene pileta y parrilla\?/.test(r1));

  // Decisión automática con seguimiento y datos faltantes.
  const autoBase: AutoInput = {
    settings: { mode: "auto", autoCategories: ["availability", "price", "features", "general"], autoPerDay: 20, autoPerSender: 3, autoSearches: true, schedule: { enabled: false, from: "09:00", to: "20:00" } },
    category: "features",
    confidence: 0.9,
    needsHuman: false,
    authFailed: false,
    replyElsewhere: false,
    availableProperties: 1,
    searchMatches: 0,
    searchStrength: 0,
    sentToday: 0,
    repliesToSender: 0,
    threadAnswered: false,
    now: new Date("2026-10-25T15:00:00Z"),
  };
  check("automático: una pregunta que figura en la publicación sale sola", decideAuto({ ...autoBase, unanswered: 0 }).auto);
  const missing = decideAuto({ ...autoBase, unanswered: 1 });
  check("automático: si el dato no está cargado igual sale sola (dice 'no figura' y el equipo recibe el aviso)", missing.auto, missing);
  const inherited = decideAuto({ ...autoBase, inherited: true });
  check("automático: una propiedad retomada de antes nunca sale sola", !inherited.auto && /retomé la de su consulta anterior/.test(inherited.why), inherited);
}

// ── Lo que se le enseña al agente (sólo ayuda en los casos dudosos) ──────────
{
  const lessons = (yes: [string, string][] = [], no: [string, string][] = []): MailLessons => ({
    inquiry: yes.map(([s, t]) => mailFingerprint(s, t)),
    notInquiry: no.map(([s, t]) => mailFingerprint(s, t)),
  });
  const subject = "Lo del cartel";
  const text = "Hola, vi el cartel de la ruta 9 cuando pasaba ayer. ¿Me pueden llamar para contarme los detalles de ese terreno?";
  const raw = classifyMail({ subject, text, hasPropertyRef: false });
  // Punto de partida: sin nombrar nada del catálogo, el agente lo descarta o lo deja dudoso.
  const base = raw.category === "other" ? raw : { ...raw, category: "other" as const, topics: [], uncertain: false, reasons: ["no nombra una propiedad ni pide nada del rubro inmobiliario"], confidence: 0.7, needsHuman: false };

  const taught = applyMailLessons(base, subject, text, lessons([[subject, text]]));
  check("lecciones (correo): un mail descartado que se parece a uno marcado como consulta pasa a revisarse", taught.category === "general" && taught.uncertain && taught.needsHuman, taught);
  check("lecciones (correo): nunca queda con confianza para responder solo", taught.confidence < AUTO_MIN_CONFIDENCE, taught.confidence);
  check("lecciones (correo): explica por qué", taught.reasons.some((r) => /ya marcó como consulta/.test(r)), taught.reasons);
  const similar = applyMailLessons(base, subject, text.replace("ese terreno", "ese lote"), lessons([[subject, text]]));
  check("lecciones (correo): un mail muy parecido también", similar.category === "general", similar.category);
  const unrelated = applyMailLessons(base, subject, text, lessons([["Factura", "Adjunto la factura del mes de octubre por el servicio de limpieza"]]));
  check("lecciones (correo): una lección que no se parece no cambia nada", unrelated.category === "other", unrelated.category);
  check("lecciones (correo): sin lecciones o vacías, igual", applyMailLessons(base, subject, text, undefined) === base && applyMailLessons(base, subject, text, lessons()) === base);
  const conflicting = applyMailLessons(base, subject, text, lessons([[subject, text]], [[subject, text]]));
  check("lecciones (correo): si se parece igual a una consulta y a un 'no', gana lo descartado", conflicting.category === "other", conflicting.category);

  // Sólo los dudosos: nada firme se toca.
  const clear = classifyMail({ subject: "", text: "¿Sigue disponible? ¿Cuánto sale?", hasPropertyRef: true });
  check("lecciones (correo): una consulta clara no se descarta aunque se le enseñe lo contrario", applyMailLessons(clear, "", "¿Sigue disponible? ¿Cuánto sale?", lessons([], [["", "¿Sigue disponible? ¿Cuánto sale?"]])).category === clear.category && !clear.uncertain);
  const promo = classifyMail({ subject: "", text: "Descuentos exclusivos en muebles. Para darse de baja haga clic aquí. Promoción imperdible", hasPropertyRef: false });
  check("lecciones (correo): una promoción firme no se rescata", applyMailLessons(promo, "", "Descuentos exclusivos en muebles. Para darse de baja haga clic aquí. Promoción imperdible", lessons([["", "Descuentos exclusivos en muebles. Para darse de baja haga clic aquí. Promoción imperdible"]])).category === "newsletter", promo.category);

  const doubt = classifyMail({ subject: "", text: "Hola, pasó algo con la propiedad", hasPropertyRef: false });
  check("lecciones (correo): (punto de partida) una consulta dudosa", doubt.uncertain && doubt.category === "general", doubt);
  const dismissed = applyMailLessons(doubt, "", "Hola, pasó algo con la propiedad", lessons([], [["", "Hola, pasó algo con la propiedad"]]));
  check("lecciones (correo): una consulta dudosa parecida a un 'no es una consulta' se descarta", dismissed.category === "other" && !dismissed.needsHuman, dismissed);
  const stays = applyMailLessons(doubt, "", "Hola, pasó algo con la propiedad", lessons([], [["Factura", "Adjunto la factura del mes de octubre"]]));
  check("lecciones (correo): si el 'no' no se parece, la duda queda", stays.category === "general" && stays.uncertain, stays);

  // Privacidad: lo que se compara no contiene datos personales y son sólo raíces.
  const fp = mailFingerprint("Consulta", "Soy Juan, mi mail es juan.perez@gmail.com y mi celular +54 9 11 3779-6683. Mirá https://x.com/mi-perfil");
  const joined = [...fp].join(" ");
  check("lecciones (correo): la huella no incluye emails, teléfonos ni links", !/gmail|3779|x\.com|perez@/.test(joined), joined);

  // Banco de frases: el gancho 'banco' sigue sin disparar financiación aunque haya lecciones.
  check("lecciones (correo): los umbrales protegen (parecido mínimo alto)", LIFT_MIN_SIMILARITY >= 0.6 && DISMISS_MIN_SIMILARITY >= LIFT_MIN_SIMILARITY);
}

// ── Decisión automática ─────────────────────────────────────────────────────
{
  const noon = new Date("2026-10-25T15:00:00Z"); // 12:00 en Argentina
  const night = new Date("2026-10-25T02:00:00Z"); // 23:00 del día anterior en Argentina
  const ok: AutoInput = {
    settings: { mode: "auto", autoCategories: ["availability", "price", "features", "general"], autoPerDay: 20, autoPerSender: 3, autoSearches: true, schedule: { enabled: false, from: "09:00", to: "20:00" } },
    category: "availability",
    confidence: 0.9,
    needsHuman: false,
    authFailed: false,
    replyElsewhere: false,
    availableProperties: 1,
    searchMatches: 0,
    searchStrength: 0,
    sentToday: 0,
    repliesToSender: 0,
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
  check("auto: a la misma persona se le responde hasta el tope diario (3) y no más", !held({ repliesToSender: 2 }) && held({ repliesToSender: 3 }) && held({ repliesToSender: 1 }, { autoPerSender: 1 }) && !held({ repliesToSender: 0 }, { autoPerSender: 1 }));
  check("auto: el motivo del tope por persona dice cuántas veces", /3 veces/.test(decideAuto({ ...ok, repliesToSender: 3 }).why) && /1 vez/.test(decideAuto({ ...ok, repliesToSender: 1, settings: { ...ok.settings, autoPerSender: 1 } }).why));

  // Búsquedas ("casas en venta en Ezeiza"): sin propiedad nombrada, pero con propiedades publicadas que coinciden.
  const search = { availableProperties: 0, searchMatches: 1, searchStrength: 3 };
  check("auto: una búsqueda con propiedades que coinciden sale sola", decideAuto({ ...ok, ...search }).auto && /tenés publicado/.test(decideAuto({ ...ok, ...search }).why), decideAuto({ ...ok, ...search }));
  check("auto: una búsqueda sin nada que coincida se confirma, y lo dice", held({ ...search, searchMatches: 0 }) && /no tengo publicado/i.test(decideAuto({ ...ok, ...search, searchMatches: 0 }).why));
  check("auto: una búsqueda con una sola señal (\"alquileres\") sale sola si hay algo publicado que coincide", !held({ ...search, searchStrength: 1 }) && held({ ...search, searchStrength: 1, searchMatches: 0 }));
  check("auto: si no pide nada concreto se confirma", held({ ...search, searchStrength: 0 }) && /No identifiqué/.test(decideAuto({ ...ok, ...search, searchStrength: 0 }).why));
  check("auto: se pueden apagar las respuestas automáticas a búsquedas", held(search, { autoSearches: false }) && /búsquedas están desactivadas/.test(decideAuto({ ...ok, ...search, settings: { ...ok.settings, autoSearches: false } }).why));
  check("auto: una búsqueda también respeta todo lo demás (remitente, persona, tope)", held({ ...search, authFailed: true }) && held({ ...search, needsHuman: true }) && held({ ...search, replyElsewhere: true }) && held({ ...search, sentToday: 20 }) && held({ ...search, confidence: 0.6 }));
  check("auto: ni dos veces en el mismo hilo", held({ threadAnswered: true }));
  const sched = { enabled: true, from: "09:00", to: "20:00" };
  check("auto: horario → dentro sale, fuera se confirma", !held({}, { schedule: sched }) && held({ now: night }, { schedule: sched }));
  check("auto: horario que cruza la medianoche", !held({ now: night }, { schedule: { enabled: true, from: "22:00", to: "06:00" } }) && held({}, { schedule: { enabled: true, from: "22:00", to: "06:00" } }));
  check("hora: se lee en Argentina", argentinaClock(noon) === "12:00" && argentinaClock(night) === "23:00", [argentinaClock(noon), argentinaClock(night)]);
  check("hora: horarios mal escritos nunca habilitan", !inSchedule(noon, "9", "20") && !inSchedule(noon, "09:00", "xx"));
  check("auto: dice por qué se confirma", /confirmaci/i.test(decideAuto({ ...ok, settings: { ...ok.settings, mode: "confirm" } }).why) && /una persona/i.test(decideAuto({ ...ok, needsHuman: true }).why));
}

// ── Un cliente nunca queda sin seguimiento: dudas para una persona y respuestas a mails automáticos ──────
{
  // El mail del informe: pregunta por casas que acepten mascotas.
  const pets = classifyMail({ subject: "", text: "Hola queria preguntarte por casas en venta que acepten mascotas,\n\nGracias", hasPropertyRef: false });
  check("atención: 'acepten mascotas' es una duda para una persona (tema mascotas)", pets.needsHuman && pets.humanTopics.includes("mascotas"), pets);
  check("atención: mascotas es un tema blando: no retiene la respuesta", !needsHardHuman(pets), pets);
  check("atención: financiación y requisitos también son blandos", SOFT_HUMAN_TOPICS.includes("financiación") && SOFT_HUMAN_TOPICS.includes("requisitos del alquiler"));
  const hard = (text: string) => needsHardHuman(classifyMail({ subject: "Consulta por una casa", text, hasPropertyRef: true }));
  check("atención: un reclamo, una permuta, negociar el precio o escriturar retienen la respuesta", hard("Quiero hacer un reclamo por la casa") && hard("¿Aceptan permuta por mi auto?") && hard("¿Es negociable el precio de la casa?") && hard("¿Cuándo se escritura la casa?"));
  check("atención: quien quiere vender también se retiene", hard("Hola, quiero vender mi casa, ¿me la pueden tasar?"));
  check("atención: sin ningún tema para una persona no hay nada que retener", !needsHardHuman({ needsHuman: false, humanTopics: [], uncertain: false }));
  check("atención: una duda del propio agente siempre la mira una persona", needsHardHuman({ needsHuman: true, humanTopics: [], uncertain: true }) && needsHardHuman({ needsHuman: true, humanTopics: ["mascotas"], uncertain: true }));

  // La decisión: lo blando sale con lo que se sabe; lo duro y la respuesta a un mail automático, no.
  const base: AutoInput = {
    settings: { mode: "auto", autoCategories: ["availability", "price", "features", "general"], autoPerDay: 20, autoPerSender: 3, autoSearches: true, schedule: { enabled: false, from: "09:00", to: "20:00" } },
    category: "general",
    confidence: 0.9,
    needsHuman: true,
    humanHard: false,
    authFailed: false,
    replyElsewhere: false,
    availableProperties: 0,
    searchMatches: 1,
    searchStrength: 3,
    sentToday: 0,
    repliesToSender: 0,
    threadAnswered: false,
    now: new Date("2026-10-25T15:00:00Z"),
  };
  check("atención: una duda blanda (mascotas) sale sola con lo que se sabe", decideAuto(base).auto, decideAuto(base));
  check("atención: una duda dura retiene la respuesta", !decideAuto({ ...base, humanHard: true }).auto && /una persona/i.test(decideAuto({ ...base, humanHard: true }).why));
  const toAuto = decideAuto({ ...base, needsHuman: false, repliedToAuto: true });
  check("atención: quien contesta un mail automático nunca recibe otra respuesta sola, y el motivo lo dice", !toAuto.auto && /mail automático/.test(toAuto.why) && /persona/.test(toAuto.why), toAuto);
  check("atención: sin 'humanHard' se sigue tomando 'needsHuman' (compatibilidad)", !decideAuto({ ...base, humanHard: undefined }).auto);

  // Qué se detecta en el hilo.
  check("atención: el pie de una respuesta automática citado en el mail se reconoce", quotesAutoFooter("Gracias!\n\n> --\n> Esta respuesta fue preparada por un asistente automático de Inmobiliaria SS. Si necesitás hablar con una persona, respondé este mail.") && !quotesAutoFooter("Hola, quiero ver la casa."));
  check("atención: un agradecimiento no cuenta como algo para una persona", isClosingReason(["es un agradecimiento o un cierre, no una consulta nueva"]) && !isClosingReason(["no nombra una propiedad ni pide nada del rubro inmobiliario"]));

  // El texto del aviso.
  const mk = (patch: Partial<AttentionInput> = {}): AttentionInput => ({ repliedToAuto: false, uncertain: false, humanTopics: [], missing: 0, autoSent: false, awaiting: false, who: "Santi", subject: "Casas en venta", ...patch });
  check("aviso: sin nada pendiente no hay aviso", attentionNotice(mk()) === null && !needsAttention(mk()));
  const noticePets = attentionNotice(mk({ humanTopics: ["mascotas"], autoSent: true }))!;
  check("aviso: la duda de mascotas dice de qué se trata y que ya se respondió lo demás", /mascotas/.test(noticePets.body) && /Ya se le respondió/.test(noticePets.body) && /Santi: Casas en venta/.test(noticePets.body) && /duda/.test(noticePets.title), noticePets);
  const noticeAuto = attentionNotice(mk({ repliedToAuto: true, awaiting: true }))!;
  check("aviso: responder un mail automático lo aclara (posiblemente quiere hablar con una persona)", /respondió a un correo automático/.test(noticeAuto.title) && /hablar con una persona/.test(noticeAuto.body) && /para confirmar/.test(noticeAuto.body), noticeAuto);
  check("aviso: un dato que la publicación no tiene se avisa", /no tiene/.test(attentionNotice(mk({ missing: 2 }))!.title) && /Confirmá el dato/.test(attentionNotice(mk({ missing: 2 }))!.body));
  check("aviso: lo que el agente no entendió se avisa", /No supe bien/.test(attentionNotice(mk({ uncertain: true }))!.title));
  check("aviso: el texto es corto y no copia el mail", attentionNotice(mk({ humanTopics: ["mascotas", "financiación"], missing: 1, subject: "x".repeat(500), awaiting: true }))!.body.length <= 200);

  // Contestar la duda desde el panel.
  const starter = followUpStarter({ fromName: "Santi McQueen", topics: ["mascotas"], settings: { closing: "", signature: "" }, agencyName: "Inmobiliaria SS" });
  check("seguimiento: arranca con saludo, el tema, el cierre y la firma de la inmobiliaria", /^Hola Santi,/.test(starter) && /Sobre mascotas: /.test(starter) && /Quedamos a tu disposición\./.test(starter) && /Equipo de Inmobiliaria SS$/.test(starter), starter);
  check("seguimiento: usa el cierre y la firma propios si los hay", /Un abrazo\n\nJuan, de SS$/.test(followUpStarter({ fromName: null, topics: [], settings: { closing: "Un abrazo", signature: "Juan, de SS" }, agencyName: "X" })));
  const bare = followUpStarter({ fromName: null, topics: [], settings: { closing: "", signature: "" }, agencyName: "X" });
  check("seguimiento: sin nombre ni tema no inventa nada", /^Hola,\n/.test(bare) && !/undefined|null|Sobre/.test(bare), bare);
  check("seguimiento: se limpian los caracteres de control y los saltos de línea", cleanFollowUp("Hola\r\n\u0000mundo\u0007\r\n") === "Hola\n" + "mundo" && cleanFollowUp("  hola  ") === "hola");
  check("seguimiento: tope de respuestas y de largo", FOLLOWUP_LIMITS.max === 10 && FOLLOWUP_LIMITS.maxChars === 6000 && FOLLOWUP_LIMITS.minChars >= 1);
}

// ── Redes sociales y firma corporativa de los mails ──────────────────────────
{
  const ok = (n: SocialNetwork, raw: string) => {
    const r = parseSocial(n, raw);
    return r.ok ? r.url : `ERROR:${r.error}`;
  };
  check("redes: un usuario se vuelve la dirección canónica", ok("instagram", "@casa_ss") === "https://www.instagram.com/casa_ss" && ok("tiktok", "casa.ss") === "https://www.tiktok.com/@casa.ss" && ok("facebook", "inmobiliaria.ss") === "https://www.facebook.com/inmobiliaria.ss");
  check("redes: un enlace se normaliza (sin parámetros, sin barra final, con https)", ok("instagram", "instagram.com/casa_ss/?utm_source=x#top") === "https://www.instagram.com/casa_ss" && ok("facebook", "http://m.facebook.com/mi.pagina/") === "https://www.facebook.com/mi.pagina");
  check("redes: el perfil de Facebook sin nombre conserva sólo su número", ok("facebook", "https://www.facebook.com/profile.php?id=1000123456789&ref=x") === "https://www.facebook.com/profile.php?id=1000123456789" && ok("facebook", "https://facebook.com/profile.php?id=abc").startsWith("ERROR"));
  check("redes: vacío es válido (es opcional)", ok("instagram", "") === "" && ok("tiktok", "   ") === "");
  check("redes: normalizar dos veces da lo mismo", ["@casa_ss", "instagram.com/casa_ss/", "https://www.instagram.com/casa_ss"].every((v) => ok("instagram", ok("instagram", v)) === ok("instagram", v)));
  check("redes: un dominio ajeno nunca pasa (ni disfrazado)", ["https://evil.com/casa", "https://instagram.com.evil.com/casa", "https://evil.com/instagram.com/casa", "https://user:pass@instagram.com/casa", "https://instagram.com:8080/casa"].every((v) => ok("instagram", v).startsWith("ERROR")));
  check("redes: esquemas raros y basura se rechazan", ["javascript:alert(1)", "data:text/html,hola", "ftp://instagram.com/x", "@", "a b", "https://www.instagram.com", "instagram.com"].every((v) => ok("instagram", v).startsWith("ERROR")), ["javascript:alert(1)", "https://www.instagram.com", "instagram.com"].map((v) => ok("instagram", v)));
  check("redes: un enlace de otra red no vale para esta", ok("tiktok", "https://www.instagram.com/casa") === "ERROR:Ese enlace no es de TikTok.");
  check("redes: sólo se listan las cargadas", socialLinks({ instagram: "@casa_ss", facebook: "", tiktok: "https://evil.com/x" }).map((s) => s.label).join() === "Instagram");

  const agency: SignatureAgency = {
    name: "Inmobiliaria SS",
    slug: "inmobiliaria-ss",
    logo: "https://res.cloudinary.com/demo/image/upload/v1/umbral/agencies/abc/logo.jpg",
    accentColor: "#2b7fff",
    contact: { phone: "011 4444-5555", whatsapp: "+54 9 11 3779-6683", email: "contacto@ss.com", website: "https://www.ss.com.ar/", instagram: "@ss_inmo", facebook: "ss.inmo", tiktok: "@ss_inmo" },
    address: { street: "Av. Siempre Viva 742", city: "Ezeiza", province: "Buenos Aires" },
  };
  const html = signatureHtml(agency, "https://recorrr.example");
  check("firma: trae nombre, dirección, contacto, redes y el enlace al perfil", ["Inmobiliaria SS", "Av. Siempre Viva 742, Ezeiza, Buenos Aires", "tel:01144445555", "https://wa.me/5491137796683", "mailto:contacto@ss.com", "https://www.ss.com.ar/", "https://www.instagram.com/ss_inmo", "https://www.facebook.com/ss.inmo", "https://www.tiktok.com/@ss_inmo", "https://recorrr.example/inmobiliarias/inmobiliaria-ss"].every((x) => html.includes(x)), html.length);
  check("firma: usa el color de la inmobiliaria y el logo reducido a PNG", html.includes("#2b7fff") && html.includes("/upload/w_120,h_120,c_fill,f_png/v1/umbral/agencies/abc/logo.jpg"));
  check("firma: es liviana (una sola imagen, sin scripts ni estilos externos)", (html.match(/<img /g) ?? []).length === 1 && !/<script|<link|<style|@import|javascript:/i.test(html) && html.length < 6000, html.length);
  const evil = signatureHtml({ name: `<script>alert(1)</script> "&"`, slug: "x", accentColor: "red; background:url(https://evil.com)", logo: "https://evil.com/logo.png", contact: { email: "a@b.co", website: "javascript:alert(1)", phone: "123", whatsapp: "x", instagram: "https://evil.com/x" }, address: { city: "<b>Ezeiza</b>" } }, null);
  check("firma: nada de lo cargado puede inyectar HTML, estilos ni esquemas raros", !/<script|<b>|javascript:|evil\.com|url\(/i.test(evil) && evil.includes("&lt;script&gt;") && evil.includes(FALLBACK_ACCENT), evil);
  check("firma: sin logo propio se dibuja la inicial con el color", /<div style="width:56px;[^"]*">I<\/div>/.test(signatureHtml({ ...agency, logo: null }, null)) && !signatureHtml({ ...agency, logo: null }, null).includes("<img"));
  check("firma: el logo sólo sale de nuestro almacenamiento", mailLogoUrl("https://evil.com/logo.png", "https://x.com") === null && mailLogoUrl("/uploads/a.png", "https://x.com") === "https://x.com/uploads/a.png" && mailLogoUrl("/uploads/a.png", null) === null);
  check("firma: el color del texto sobre el botón siempre se lee", readableOn("#ffffff") === "#111111" && readableOn("#d4c5a9") === "#111111" && readableOn("#78582e") === "#ffffff" && readableOn("#0e0f11") === "#ffffff");
  check("firma: un color inválido cae en el de la plataforma", safeHex("azul") === FALLBACK_ACCENT && safeHex("#ABCDEF") === "#abcdef" && safeHex(null) === FALLBACK_ACCENT);
  const txt = signatureText(agency, "https://recorrr.example");
  check("firma: la versión de texto lleva lo mismo", /^--\nInmobiliaria SS\nAv\. Siempre Viva 742, Ezeiza, Buenos Aires\nTel: 011 4444-5555 · WhatsApp: \+54 9 11 3779-6683 · Email: contacto@ss\.com · Web: www\.ss\.com\.ar/.test(txt) && txt.includes("Instagram: https://www.instagram.com/ss_inmo") && txt.endsWith("Más propiedades: https://recorrr.example/inmobiliarias/inmobiliaria-ss"), txt);

  const footer = "--\nEsta respuesta fue preparada por un asistente automático de Inmobiliaria SS. Si necesitás hablar con una persona, respondé este mail.";
  const body = `Hola Santi,\n\nSí, la casa sigue disponible: https://recorrr.example/propiedades/casa-1.\n\nEquipo de Inmobiliaria SS\n\n${footer}`;
  const out = buildOutgoing(body, agency, "https://recorrr.example", { banner: true });
  check("mail: con firma sale texto y HTML", !!out.html && out.text.includes("Inmobiliaria SS") && out.text.startsWith("Hola Santi,"), out.text);
  check("mail: el aviso de respuesta automática queda DEBAJO de la firma (texto y HTML)", out.text.endsWith(footer) && out.text.indexOf("Av. Siempre Viva") < out.text.indexOf("preparada por un asistente") && out.html!.indexOf("Av. Siempre Viva") < out.html!.indexOf("preparada por un asistente"));
  check("mail: los enlaces del cuerpo son clicables y sin el punto final", out.html!.includes('<a href="https://recorrr.example/propiedades/casa-1" style="color:inherit"') && out.html!.includes("</a>."));
  check("mail: sin firma (desactivada) sale como antes: sólo texto", buildOutgoing(body, agency, null, { banner: false }).html === null && buildOutgoing(body, agency, null, { banner: false }).text === body);
  check("mail: el texto del cliente se escapa en el HTML", textToHtml("<b>hola</b> & \"chau\"").includes("&lt;b&gt;hola&lt;/b&gt; &amp; &quot;chau&quot;") && !textToHtml("<img src=x onerror=alert(1)>").includes("<img"));
  check("mail: sin pie automático (confirmada por una persona) no se inventa uno", !buildOutgoing("Hola\n\nChau", agency, null, { banner: true }).text.includes("asistente"));
}

hosts().then(() => {
  console.log(`\n${total - failed}/${total} pruebas correctas`);
  process.exit(failed > 0 ? 1 : 0);
});
