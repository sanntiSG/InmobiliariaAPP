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
import { withAgencyName, withAgencyParam } from "../src/lib/notifications/agency-link";
import { confirmTitle } from "../src/lib/mail/attention";
import { hourKey, mediaFingerprint, newMediaKinds, newMediaMessage, priceChangeMessage, socialDedupeKey, socialMessage, socialPushTag, unavailableMessage, type SocialEvent } from "../src/lib/notifications/social-text";

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
  check("privacidad: todos los tipos que nombran clientes o mails son genéricos", ["lead", "mail_draft", "mail_auto", "mail_attention", "mail_error", "agency_request", "admin_alert", "opportunity"].every((t) => PRIVATE_PUSH_TYPES.has(t) && buildPushPayload({ id: "1", type: t, title: "x", body: "dato personal" }, "X").body.includes("Tocá para verlo")));
  const open = buildPushPayload({ id: "7", type: "price_drop", title: "Bajó el precio de una propiedad que guardaste", body: "Casa en Tigre", href: "/propiedades/casa-en-tigre" }, brand.name);
  check("avisos públicos: llevan su texto, su enlace y una marca para no apilarse", open.body === "Casa en Tigre" && open.href === "/propiedades/casa-en-tigre" && open.tag === "n:7");
  check("enlace: sólo rutas internas (nada externo ni '//')", safeHref("https://evil.com") === "/notificaciones" && safeHref("//evil.com/x") === "/notificaciones" && safeHref("javascript:alert(1)") === "/notificaciones" && safeHref("/ok?a=1") === "/ok?a=1" && safeHref(undefined) === "/notificaciones" && safeHref("/con espacio") === "/notificaciones");
  check("texto: se acorta lo largo y nunca queda vacío el título", buildPushPayload({ id: "1", type: "activity", title: "t".repeat(300), body: "b".repeat(500) }, "X").title.length <= 90 && buildPushPayload({ id: "1", type: "activity", title: "t".repeat(300), body: "b".repeat(500) }, "X").body.length <= 140 && buildPushPayload({ id: "1", type: "activity", title: "  " }, "Marca").title === "Marca");

  // ── Agrupar en el dispositivo (tag y título propios) ──────────────────────
  const grouped = buildPushPayload({ id: "9", type: "mail_draft", title: "Hay una respuesta para confirmar.", body: "x", push: { tag: "mail-confirm:abc123", title: "Tenés 3 respuestas para confirmar" } }, "X");
  check("agrupar: un tag propio reemplaza al por aviso y vuelve a avisar (renotify)", grouped.tag === "mail-confirm:abc123" && grouped.renotify === true && open.renotify === false);
  check("agrupar: el título propio se usa en el dispositivo (la campana conserva el suyo)", grouped.title === "Tenés 3 respuestas para confirmar" && buildPushPayload({ id: "9", type: "like", title: "A alguien le gustó «Casa»", push: { tag: null, title: null } }, "X").title === "A alguien le gustó «Casa»");
  check("agrupar: un tag raro (espacios, símbolos, muy largo) se descarta y vale el por aviso", ["con espacio", "a/b", "<script>", "x".repeat(65), ""].every((t) => buildPushPayload({ id: "5", type: "like", title: "t", push: { tag: t } }, "X").tag === "n:5"));
  check("agrupar: un aviso privado sigue genérico aunque tenga título propio", buildPushPayload({ id: "1", type: "mail_draft", title: "t", body: "María: quiero ver la casa", push: { title: "Tenés 2 respuestas para confirmar" } }, "X").body === "Tocá para verlo en X.");
  check("agrupar: el título del total (uno, varios)", confirmTitle(1) === "Tenés 1 respuesta para confirmar" && confirmTitle(0) === "Tenés 1 respuesta para confirmar" && confirmTitle(3) === "Tenés 3 respuestas para confirmar");

  // ── Inmobiliaria sin dueño: el aviso va al admin con el enlace de ESA inmobiliaria ──
  const AG = "6a9e1a2622a2aace3e629905";
  check("sin dueño: el enlace del panel abre esa inmobiliaria (?agencyId=) y conserva lo demás", withAgencyParam("/dashboard/agentes/correo?m=abc", AG) === `/dashboard/agentes/correo?m=abc&agencyId=${AG}` && withAgencyParam("/dashboard/clientes", AG) === `/dashboard/clientes?agencyId=${AG}` && withAgencyParam("/dashboard", AG) === `/dashboard?agencyId=${AG}`);
  check("sin dueño: fichas, admin, enlaces externos o ids raros no se tocan", withAgencyParam("/propiedades/casa", AG) === "/propiedades/casa" && withAgencyParam("/admin/agentes/mail", AG) === "/admin/agentes/mail" && withAgencyParam("https://evil.com/dashboard", AG) === "https://evil.com/dashboard" && withAgencyParam("//evil.com/dashboard", AG) === "//evil.com/dashboard" && withAgencyParam("/dashboard/x", "no-es-un-id") === "/dashboard/x" && withAgencyParam(undefined, AG) === undefined);
  check("sin dueño: si ya trae ?agencyId se reemplaza (no queda duplicado)", withAgencyParam(`/dashboard/clientes?agencyId=${"f".repeat(24)}`, AG) === `/dashboard/clientes?agencyId=${AG}`);
  check("sin dueño: el texto nombra la inmobiliaria (acotado) y no queda vacío", withAgencyName("Nueva consulta", "Inmobiliaria SS") === "«Inmobiliaria SS» · Nueva consulta" && withAgencyName(undefined, "Inmobiliaria SS") === "«Inmobiliaria SS»" && withAgencyName("x", "") === "x" && withAgencyName("x", "n".repeat(200)).length < 90);

  // ── Avisos sociales (para la inmobiliaria) ────────────────────────────────
  const PID = "6a9e1a2622a2aace3e629999";
  const events: SocialEvent[] = ["follower", "like", "save", "share", "rating", "property_comment"];
  const msgs = events.map((event) => socialMessage({ event, propertyId: PID, propertyTitle: "Casa en Tigre", stars: 4, text: "¿Aceptan mascotas?" }));
  check("sociales: todos los eventos tienen texto, y el enlace es una ruta interna del panel", msgs.every((m) => m.title.length > 0 && m.body.length > 0 && /^\/dashboard/.test(m.href) && safeHref(m.href) === m.href));
  check("sociales: ninguno nombra a quien actuó (sólo «alguien»)", msgs.every((m) => !/@|Pérez|María/.test(m.body)) && /alguien/i.test(socialMessage({ event: "like", propertyId: PID, propertyTitle: "x" }).body) && /alguien/i.test(socialMessage({ event: "follower" }).body));
  check("sociales: el puntaje y el comentario dicen lo suyo; el texto largo se acorta", /4 estrellas/.test(socialMessage({ event: "rating", propertyId: PID, propertyTitle: "x", stars: 4 }).body) && /1 estrella\b/.test(socialMessage({ event: "rating", propertyId: PID, propertyTitle: "x", stars: 1 }).body) && /mascotas/.test(socialMessage({ event: "property_comment", propertyId: PID, propertyTitle: "x", text: "¿Aceptan mascotas?" }).body) && socialMessage({ event: "property_comment", propertyId: PID, propertyTitle: "x", text: "a".repeat(900) }).body.length < 200);
  check("sociales: el título largo o vacío no rompe el texto", socialMessage({ event: "like", propertyId: PID, propertyTitle: "t".repeat(500) }).body.length < 120 && /tu propiedad/.test(socialMessage({ event: "like", propertyId: PID, propertyTitle: "  " }).body));
  const T0 = new Date("2026-10-28T14:05:00Z");
  check("anti-repetición: me gusta, guardar y puntuar usan al usuario: dar, quitar y volver a dar es la misma clave", socialDedupeKey({ event: "like", propertyId: PID, actor: "u1" }) === socialDedupeKey({ event: "like", propertyId: PID, actor: "u1" }) && socialDedupeKey({ event: "like", propertyId: PID, actor: "u1" }) !== socialDedupeKey({ event: "like", propertyId: PID, actor: "u2" }) && socialDedupeKey({ event: "like", propertyId: PID, actor: "u1" }) !== socialDedupeKey({ event: "save", propertyId: PID, actor: "u1" }));
  check("anti-repetición: compartir es anónimo → una vez por hora y propiedad, sin importar quién", socialDedupeKey({ event: "share", propertyId: PID, actor: "u1", now: T0 }) === socialDedupeKey({ event: "share", propertyId: PID, actor: "u2", now: new Date("2026-10-28T14:59:00Z") }) && socialDedupeKey({ event: "share", propertyId: PID, now: T0 }) !== socialDedupeKey({ event: "share", propertyId: PID, now: new Date("2026-10-28T15:00:00Z") }) && hourKey(T0) === "2026-10-28T14");
  check("anti-repetición: cada comentario y cada seguidor tienen su clave; ninguna lleva datos personales", socialDedupeKey({ event: "property_comment", propertyId: PID, commentId: "c1" }) === "comment:c1" && socialDedupeKey({ event: "follower", agencyId: "a1", actor: "u1" }) === "follow:a1:u1" && events.every((event) => !/@|\s/.test(socialDedupeKey({ event, propertyId: PID, agencyId: "a1", actor: "u1", commentId: "c1", now: T0 }))));
  check("tag del dispositivo: lo de una propiedad se agrupa por propiedad y los seguidores por inmobiliaria", socialPushTag({ event: "like", propertyId: PID, agencyId: "a1" }) === `social:${PID}` && socialPushTag({ event: "follower", propertyId: PID, agencyId: "a1" }) === "social:a1" && buildPushPayload({ id: "1", type: "like", title: "t", push: { tag: socialPushTag({ event: "like", propertyId: PID }) } }, "X").tag === `social:${PID}`);

  // ── Cambios en una propiedad (para quien la guardó, le gustó o pidió aviso) ──
  const house = { title: "Casa en Tigre", slug: "casa-en-tigre", operation: "venta", type: "casa", city: "Tigre", neighborhood: "Nordelta" };
  const drop = priceChangeMessage("drop", house, { amount: 200000, currency: "USD" }, { amount: 185000, currency: "USD" }, { operation: "venta", period: "total" });
  const up = priceChangeMessage("up", house, { amount: 185000, currency: "USD" }, { amount: 200000, currency: "USD" }, { operation: "venta", period: "total" });
  check("precio: baja y suba tienen su tipo, su texto y la ficha como enlace", drop.type === "price_drop" && up.type === "price_up" && /Bajó/.test(drop.title) && /Subió/.test(up.title) && drop.href === "/propiedades/casa-en-tigre" && /200\.000/.test(drop.body) && /185\.000/.test(drop.body));
  check("precio: un alquiler dice el período (por mes, por noche) y una venta no", /\/mes/.test(priceChangeMessage("up", house, { amount: 500000, currency: "ARS" }, { amount: 550000, currency: "ARS" }, { operation: "alquiler", period: "mensual" }).body) && /\/noche/.test(priceChangeMessage("drop", house, { amount: 60000, currency: "ARS" }, { amount: 50000, currency: "ARS" }, { operation: "alquiler_temporal", period: "noche" }).body) && !/\/(mes|noche|semana)/.test(drop.body));
  const sold = unavailableMessage(house, "sold");
  const rented = unavailableMessage({ ...house, operation: "alquiler" }, "rented");
  check("ya no disponible: una venta lleva a propiedades parecidas (la ficha ya no se abre) y un alquiler a su ficha", /^\/propiedades\?/.test(sold.href) && sold.href.includes("operation=venta") && sold.href.includes("type=casa") && sold.href.includes("neighborhood=Nordelta") && rented.href === "/propiedades/casa-en-tigre" && /Se vendió/.test(sold.title) && /Se alquiló/.test(rented.title) && /reservada/.test(unavailableMessage(house, "reserved").title));
  check("ya no disponible: sin barrio usa la ciudad, y el enlace sigue siendo interno", /city=Tigre/.test(unavailableMessage({ ...house, neighborhood: null }, "sold").href) && safeHref(sold.href) === sold.href);
  const m0 = mediaFingerprint({ images: [{ url: "https://x/a.jpg", providerId: "a" }, { url: "https://x/b.jpg" }], videos: [{ videoId: "v1", url: "https://y/v1" }], tours: [{ id: "t1" }] });
  const photoAdded = mediaFingerprint({ images: [{ url: "https://x/a.jpg", providerId: "a" }, { url: "https://x/b.jpg" }, { url: "https://x/c.jpg" }], videos: [{ videoId: "v1", url: "https://y/v1" }], tours: [{ id: "t1" }] });
  const removed = mediaFingerprint({ images: [{ url: "https://x/a.jpg", providerId: "a" }], videos: [], tours: [] });
  const everything = mediaFingerprint({ images: [{ url: "https://x/a.jpg", providerId: "a" }, { url: "https://x/z.jpg" }], videos: [{ videoId: "v1" }, { videoId: "v2" }], tours: [{ id: "t1" }, { photo360Url: "https://x/360.jpg" }] });
  check("fotos nuevas: sólo avisa lo que se SUMÓ (quitar, reordenar o no cambiar nada no avisa)", newMediaKinds(m0, photoAdded).join() === "photos" && newMediaKinds(m0, removed).length === 0 && newMediaKinds(m0, m0).length === 0 && newMediaKinds(m0, mediaFingerprint({ images: [{ url: "https://x/b.jpg" }, { url: "https://x/a.jpg", providerId: "a" }], videos: [{ videoId: "v1" }], tours: [{ id: "t1" }] })).length === 0 && newMediaKinds(m0, everything).join() === "photos,video,tour");
  check("fotos nuevas: una propiedad sin multimedia no rompe nada y el texto lista lo sumado", newMediaKinds(mediaFingerprint(null), mediaFingerprint(undefined)).length === 0 && newMediaKinds(mediaFingerprint({}), mediaFingerprint({ images: [{ url: "https://x/a.jpg" }] })).join() === "photos" && /fotos nuevas/.test(newMediaMessage(house, ["photos"]).body) && /fotos nuevas, un video nuevo y un recorrido nuevo/.test(newMediaMessage(house, ["photos", "video", "tour"]).body) && newMediaMessage(house, ["video"]).href === "/propiedades/casa-en-tigre");

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
  check("grupos: cada tipo de cuenta ve lo suyo", groupsForRole("user").join() === "recomendaciones,actividad" && groupsForRole("agency_owner").join() === "gestion,actividad" && groupsForRole("agency_agent").join() === "gestion,actividad" && groupsForRole("admin").join() === "gestion,actividad" && groupsForRole(undefined).join() === "recomendaciones,actividad");
  check("tipos privados: todos existen", [...PRIVATE_PUSH_TYPES].every((t) => (NOTIFICATION_TYPES as readonly string[]).includes(t)));

  console.log(`\n${total - failed}/${total} pruebas correctas`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(2);
});
