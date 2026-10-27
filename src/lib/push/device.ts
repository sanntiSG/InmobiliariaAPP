/**
 * Qué dispositivo y navegador usa la persona y qué tiene que hacer para recibir avisos. La diferencia importante es iPhone/iPad:
 * ahí el navegador SÓLO deja pedir el permiso si la plataforma está agregada a la pantalla de inicio (desde Safari, iOS/iPadOS
 * 16.4 o posterior); en Android, PC y Mac se puede directo desde el navegador. Funciones puras: reciben el user-agent y lo que
 * el navegador declara (soporte, modo instalada), así se pueden probar sin navegador.
 */

export type Platform = "ios" | "android" | "desktop";
export type Browser = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "opera" | "other";

export type Device = { platform: Platform; browser: Browser; iosVersion: number | null };

export type DeviceEnv = {
  /** `navigator.maxTouchPoints`: un iPad en "modo escritorio" se anuncia como Mac pero tiene pantalla táctil. */
  touchPoints?: number;
};

export function detectDevice(ua: string, env: DeviceEnv = {}): Device {
  const isIpadDesktopMode = /Macintosh/.test(ua) && (env.touchPoints ?? 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || isIpadDesktopMode;
  const android = /Android/.test(ua);
  const platform: Platform = ios ? "ios" : android ? "android" : "desktop";

  // El orden importa: Edge, Opera y Samsung dicen "Chrome" en su user-agent; Chrome, Firefox y Edge en iOS dicen "CriOS/FxiOS/EdgiOS".
  let browser: Browser = "other";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = "edge";
  else if (/OPR\/|OPiOS|Opera/.test(ua)) browser = "opera";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/FxiOS|Firefox\//.test(ua)) browser = "firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua)) browser = "safari";

  const v = /OS (\d+)[_.](\d+)/.exec(ua);
  const iosVersion = ios && v ? Number(v[1]) + Number(v[2]) / 100 : ios && isIpadDesktopMode ? null : null;
  return { platform, browser, iosVersion };
}

/** "iPhone · Safari", "Android · Chrome", "PC · Firefox": para listar dispositivos sin datos técnicos. */
export function deviceLabel(ua: string, env: DeviceEnv = {}): string {
  const d = detectDevice(ua, env);
  const place = d.platform === "ios" ? (/iPad/.test(ua) || (/Macintosh/.test(ua) && (env.touchPoints ?? 0) > 1) ? "iPad" : "iPhone") : d.platform === "android" ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "PC" : "Computadora";
  const names: Record<Browser, string> = { safari: "Safari", chrome: "Chrome", edge: "Edge", firefox: "Firefox", samsung: "Samsung Internet", opera: "Opera", other: "Navegador" };
  return `${place} · ${names[d.browser]}`.slice(0, 60);
}

export type PushCaps = {
  /** El navegador tiene service worker, PushManager y Notification. */
  supported: boolean;
  /** La plataforma está abierta como app instalada (pantalla de inicio): `display-mode: standalone` o `navigator.standalone`. */
  standalone: boolean;
  /** `Notification.permission`. */
  permission: "default" | "granted" | "denied";
};

export type PushStatus =
  | { kind: "ready" } // se puede pedir el permiso ahora
  | { kind: "granted" } // ya está permitido en este navegador
  | { kind: "denied" } // la persona lo bloqueó: hay que desbloquearlo en el navegador
  | { kind: "ios_install" } // iPhone/iPad en Safari: primero agregarla a la pantalla de inicio
  | { kind: "ios_safari" } // iPhone/iPad en otro navegador: abrirla en Safari
  | { kind: "ios_old" } // iOS anterior a 16.4: no existe
  | { kind: "unsupported" }; // este navegador no tiene avisos del dispositivo

/** Qué le corresponde hacer a esta persona en este dispositivo, sin instrucciones genéricas. */
export function pushStatus(device: Device, caps: PushCaps): PushStatus {
  if (device.platform === "ios") {
    if (device.iosVersion != null && device.iosVersion < 16.04) return { kind: "ios_old" };
    // En iOS el navegador sólo expone el soporte cuando la plataforma está instalada en la pantalla de inicio.
    if (!caps.standalone) return device.browser === "safari" ? { kind: "ios_install" } : { kind: "ios_safari" };
  }
  if (!caps.supported) return { kind: "unsupported" };
  if (caps.permission === "denied") return { kind: "denied" };
  if (caps.permission === "granted") return { kind: "granted" };
  return { kind: "ready" };
}

/** Cómo desbloquear los avisos en el navegador (la persona los bloqueó antes), por plataforma. */
export function unblockSteps(device: Device): string[] {
  if (device.platform === "ios") return ["Abrí Ajustes del iPhone o iPad.", "Entrá en Notificaciones y buscá esta plataforma en la lista.", "Activá «Permitir notificaciones»."];
  if (device.platform === "android") return ["Tocá el candado (o los tres puntos) junto a la dirección del sitio.", "Entrá en Permisos o Configuración del sitio.", "Poné «Notificaciones» en Permitir."];
  return ["Hacé clic en el candado (o el ícono de ajustes) a la izquierda de la dirección del sitio.", "Buscá «Notificaciones» y cambialo a Permitir.", "Volvé a cargar la página."];
}

/** Los pasos para agregarla a la pantalla de inicio en iPhone/iPad (Safari). */
export const IOS_INSTALL_STEPS = [
  "Abrí esta página en Safari (no en otra app).",
  "Tocá el botón Compartir (el cuadrado con la flecha hacia arriba).",
  "Elegí «Agregar a la pantalla de inicio» y confirmá.",
  "Abrí la plataforma desde el ícono nuevo de tu pantalla de inicio y volvé acá para activar los avisos.",
] as const;
