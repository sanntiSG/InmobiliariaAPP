/**
 * Pruebas de los avisos del dispositivo (push) — sin base de datos ni red: claves VAPID, texto de los avisos (privacidad), lista
 * cerrada de servicios de push, detección de dispositivo y qué le corresponde hacer a cada persona, y la tabla de grupos de
 * notificación. Correr con `npm run push:check`: sale con código 1 si alguna falla.
 */
import webpush from "web-push";
import { NOTIFICATION_TYPES } from "../src/lib/db/models/Notification";
import { MUTABLE_GROUPS, NOTIFICATION_GROUPS, PRIVATE_PUSH_TYPES, TYPE_GROUP, groupOf, groupsForRole } from "../src/config/notifications";
import { NOTIFICATION_META } from "../src/components/notifications/notification-meta";
import { brand } from "../src/config/brand";
import { fromB64Url, generateVapidKeys, isValidVapidPrivateKey, isValidVapidPublicKey } from "../src/lib/push/keys";
import { buildPushPayload, safeHref } from "../src/lib/push/payload";
import { areValidSubscriptionKeys, isKnownPushEndpoint } from "../src/lib/push/endpoint";
import { deviceLabel, detectDevice, pushStatus, unblockSteps, IOS_INSTALL_STEPS } from "../src/lib/push/device";
import { vapidConfig } from "../src/lib/push/vapid";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  iphoneOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  iphone164: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
};

async function main() {
  // ── Claves VAPID ──────────────────────────────────────────────────────────
  const a = await generateVapidKeys();
  const b = await generateVapidKeys();
  check("claves: la pública son 65 bytes sin comprimir (87 caracteres) y la privada 32 bytes (43)", isValidVapidPublicKey(a.publicKey) && isValidVapidPrivateKey(a.privateKey) && fromB64Url(a.publicKey).length === 65 && fromB64Url(a.publicKey)[0] === 4 && fromB64Url(a.privateKey).length === 32, [a.publicKey.length, a.privateKey.length]);
  check("claves: cada par es distinto y no tienen relleno ni caracteres de URL", a.publicKey !== b.publicKey && a.privateKey !== b.privateKey && !/[=+/]/.test(a.publicKey + a.privateKey));
  check("claves: el par generado lo acepta la librería de envío (web-push)", (() => { try { webpush.setVapidDetails("https://ejemplo.com", a.publicKey, a.privateKey); return true; } catch { return false; } })());
  check("claves: se rechaza lo que no es una clave", !isValidVapidPublicKey("abc") && !isValidVapidPublicKey(a.privateKey) && !isValidVapidPrivateKey(a.publicKey) && !isValidVapidPrivateKey("") && !isValidVapidPublicKey(null) && !isValidVapidPublicKey("A".repeat(87)));
  check("claves: la lectura del entorno exige las dos y válidas", vapidConfig({} as NodeJS.ProcessEnv) === null && vapidConfig({ VAPID_PUBLIC_KEY: a.publicKey } as unknown as NodeJS.ProcessEnv) === null && vapidConfig({ VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "y" } as unknown as NodeJS.ProcessEnv) === null && vapidConfig({ VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: a.privateKey } as unknown as NodeJS.ProcessEnv)?.publicKey === a.publicKey);
  check("claves: el subject siempre es https o mailto (lo exige el estándar)", /^(https:\/\/|mailto:)/.test(vapidConfig({ VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: a.privateKey, VAPID_SUBJECT: "javascript:alert(1)" } as unknown as NodeJS.ProcessEnv)!.subject));

  // ── Texto de los avisos ───────────────────────────────────────────────────
  const lead = buildPushPayload({ id: "1", type: "lead", title: "Nueva consulta de María Pérez", body: "maria@example.com: quiero ver la casa", href: "/dashboard/clientes" }, brand.name);
  check("privacidad: un aviso de gestión no muestra el detalle en la pantalla bloqueada (y usa el nombre de la marca, no uno fijo)", lead.body === `Tocá para verlo en ${brand.name}.` && !/maria|example|casa/i.test(lead.body));
  check("privacidad: todos los tipos que nombran clientes o mails son genéricos", ["lead", "mail_draft", "mail_attention", "mail_error", "agency_request", "admin_alert", "opportunity"].every((t) => PRIVATE_PUSH_TYPES.has(t) && buildPushPayload({ id: "1", type: t, title: "x", body: "dato personal" }, "X").body.includes("Tocá para verlo")));
  const open = buildPushPayload({ id: "7", type: "price_drop", title: "Bajó el precio de una propiedad que guardaste", body: "Casa en Tigre", href: "/propiedades/casa-en-tigre" }, brand.name);
  check("avisos públicos: llevan su texto, su enlace y una marca para no apilarse", open.body === "Casa en Tigre" && open.href === "/propiedades/casa-en-tigre" && open.tag === "n:7");
  check("enlace: sólo rutas internas (nada externo ni '//')", safeHref("https://evil.com") === "/notificaciones" && safeHref("//evil.com/x") === "/notificaciones" && safeHref("javascript:alert(1)") === "/notificaciones" && safeHref("/ok?a=1") === "/ok?a=1" && safeHref(undefined) === "/notificaciones" && safeHref("/con espacio") === "/notificaciones");
  check("texto: se acorta lo largo y nunca queda vacío el título", buildPushPayload({ id: "1", type: "activity", title: "t".repeat(300), body: "b".repeat(500) }, "X").title.length <= 90 && buildPushPayload({ id: "1", type: "activity", title: "t".repeat(300), body: "b".repeat(500) }, "X").body.length <= 140 && buildPushPayload({ id: "1", type: "activity", title: "  " }, "Marca").title === "Marca");

  // ── Servicios de push ─────────────────────────────────────────────────────
  const good = ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/QWxn", "https://wns2-par02p.notify.windows.com/w/?token=x", "https://eu.push.apple.com/x", "https://us-east.push.services.mozilla.com/x"];
  check("endpoints: los servicios reales de los navegadores se aceptan", good.every(isKnownPushEndpoint), good.filter((u) => !isKnownPushEndpoint(u)));
  const bad = ["http://fcm.googleapis.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/fcm.googleapis.com", "https://fcm.googleapis.com:8443/x", "https://user:pass@fcm.googleapis.com/x", "https://notify.windows.com/x", "ftp://fcm.googleapis.com/x", "no-es-una-url", "https://push.apple.com.evil.com/x", "https://evilnotify.windows.com.x/y"];
  check("endpoints: nada interno, ajeno ni disfrazado (se evita que el servidor llame a una dirección elegida por un usuario)", bad.every((u) => !isKnownPushEndpoint(u)), bad.filter(isKnownPushEndpoint));
  check("endpoints: el dominio pelado de un sufijo no vale", !isKnownPushEndpoint("https://push.apple.com/x") && !isKnownPushEndpoint("https://.notify.windows.com/x"));
  const p256 = "B".repeat(87);
  check("claves del dispositivo: base64url con el largo esperado", areValidSubscriptionKeys({ p256dh: p256, auth: "a".repeat(22) }) && !areValidSubscriptionKeys({ p256dh: "corta", auth: "a".repeat(22) }) && !areValidSubscriptionKeys({ p256dh: p256, auth: "con espacio y caracteres raros!!" }) && !areValidSubscriptionKeys(null) && !areValidSubscriptionKeys({}));

  // ── Dispositivos ──────────────────────────────────────────────────────────
  check("dispositivo: plataforma y navegador de cada user-agent", detectDevice(UA.iphoneSafari).platform === "ios" && detectDevice(UA.iphoneSafari).browser === "safari" && detectDevice(UA.iphoneChrome).browser === "chrome" && detectDevice(UA.androidChrome).platform === "android" && detectDevice(UA.samsung).browser === "samsung" && detectDevice(UA.winEdge).browser === "edge" && detectDevice(UA.winChrome).browser === "chrome" && detectDevice(UA.macSafari).browser === "safari" && detectDevice(UA.firefox).browser === "firefox" && detectDevice(UA.firefox).platform === "desktop");
  check("dispositivo: un iPad en modo escritorio se reconoce por la pantalla táctil", detectDevice(UA.ipadDesktop, { touchPoints: 5 }).platform === "ios" && detectDevice(UA.macSafari, { touchPoints: 0 }).platform === "desktop");
  check("dispositivo: la versión de iOS (16.4 es la primera con avisos)", detectDevice(UA.iphoneSafari).iosVersion === 17.02 && detectDevice(UA.iphone164).iosVersion === 16.04 && detectDevice(UA.iphoneOld).iosVersion === 15.06);
  check("dispositivo: nombres claros para listar", deviceLabel(UA.iphoneSafari) === "iPhone · Safari" && deviceLabel(UA.androidChrome) === "Android · Chrome" && deviceLabel(UA.winEdge) === "PC · Edge" && deviceLabel(UA.macSafari) === "Mac · Safari" && deviceLabel(UA.ipadDesktop, { touchPoints: 5 }) === "iPad · Safari");

  const caps = (over: Partial<{ supported: boolean; standalone: boolean; permission: "default" | "granted" | "denied" }> = {}) => ({ supported: true, standalone: false, permission: "default" as const, ...over });
  check("estado: en PC y Android se puede activar directo, sin instalar nada", pushStatus(detectDevice(UA.winChrome), caps()).kind === "ready" && pushStatus(detectDevice(UA.androidChrome), caps()).kind === "ready" && pushStatus(detectDevice(UA.macSafari), caps()).kind === "ready");
  check("estado: iPhone en Safari sin instalar → primero agregar a la pantalla de inicio", pushStatus(detectDevice(UA.iphoneSafari), caps({ supported: false })).kind === "ios_install");
  check("estado: iPhone en Safari ya instalada → se puede activar", pushStatus(detectDevice(UA.iphoneSafari), caps({ standalone: true })).kind === "ready");
  check("estado: iPhone en otro navegador → abrir en Safari", pushStatus(detectDevice(UA.iphoneChrome), caps({ supported: false })).kind === "ios_safari");
  check("estado: iOS anterior a 16.4 → no existe, y se dice", pushStatus(detectDevice(UA.iphoneOld), caps({ standalone: true })).kind === "ios_old" && pushStatus(detectDevice(UA.iphone164), caps({ standalone: true })).kind === "ready");
  check("estado: sin soporte del navegador, bloqueado y ya permitido", pushStatus(detectDevice(UA.winChrome), caps({ supported: false })).kind === "unsupported" && pushStatus(detectDevice(UA.winChrome), caps({ permission: "denied" })).kind === "denied" && pushStatus(detectDevice(UA.winChrome), caps({ permission: "granted" })).kind === "granted");
  check("pasos: cada plataforma tiene sus instrucciones para desbloquear y para instalar en iPhone", unblockSteps(detectDevice(UA.iphoneSafari))[0]!.includes("Ajustes") && unblockSteps(detectDevice(UA.androidChrome))[0]!.includes("candado") && unblockSteps(detectDevice(UA.winChrome)).length === 3 && IOS_INSTALL_STEPS.length === 4 && IOS_INSTALL_STEPS.some((s) => s.includes("Agregar a la pantalla de inicio")));

  // ── Grupos de notificación ────────────────────────────────────────────────
  check("grupos: TODOS los tipos de notificación tienen grupo (si se agrega uno nuevo y se olvida, falla acá)", NOTIFICATION_TYPES.every((t) => t in TYPE_GROUP), NOTIFICATION_TYPES.filter((t) => !(t in TYPE_GROUP)));
  check("grupos: la tabla no tiene tipos que no existen ni grupos inventados", Object.keys(TYPE_GROUP).every((t) => (NOTIFICATION_TYPES as readonly string[]).includes(t)) && Object.values(TYPE_GROUP).every((g) => (NOTIFICATION_GROUPS as readonly string[]).includes(g)));
  check("grupos: la campana y el servidor coinciden", NOTIFICATION_TYPES.every((t) => NOTIFICATION_META[t]?.group === groupOf(t)));
  check("grupos: 'sistema' nunca se silencia y lo desconocido cae ahí", !MUTABLE_GROUPS.includes("sistema") && groupOf("tipo-inventado") === "sistema" && groupOf("agency_approved") === "sistema");
  check("grupos: cada tipo de cuenta ve lo suyo", groupsForRole("user").join() === "recomendaciones,actividad" && groupsForRole("agency_owner").join() === "gestion,actividad" && groupsForRole("agency_agent").join() === "gestion,actividad" && groupsForRole("admin").join() === "gestion" && groupsForRole(undefined).join() === "recomendaciones,actividad");
  check("tipos privados: todos existen", [...PRIVATE_PUSH_TYPES].every((t) => (NOTIFICATION_TYPES as readonly string[]).includes(t)));

  console.log(`\n${total - failed}/${total} pruebas correctas`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(2);
});
