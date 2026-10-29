/**
 * La guía gráfica para activar los avisos del dispositivo: qué pasos le tocan a CADA persona según su dispositivo y navegador (nada de
 * instrucciones genéricas) y qué ilustración acompaña a cada uno. Los textos salen de `device.ts` (una sola fuente); acá sólo se
 * decide el orden y la escena. Módulo puro: lo prueba `push:check`.
 */
import { IOS_INSTALL_STEPS, unblockSteps, type Device, type PushStatus } from "./device";

/** Cada escena es una ilustración (ver `components/push/guide/scenes.tsx`). */
export type GuideScene =
  | "ios-safari" // iPhone: la barra de Safari
  | "ios-share" // iPhone: el botón Compartir
  | "ios-add" // iPhone: «Agregar a la pantalla de inicio»
  | "ios-home" // iPhone: el ícono nuevo en la pantalla de inicio
  | "ios-allow" // iPhone: el cuadro de permiso
  | "android-allow"
  | "desktop-allow"
  | "ios-unblock" // iPhone: Ajustes → Notificaciones
  | "android-unblock" // Android: el candado de la dirección
  | "desktop-unblock"; // PC: el candado de la dirección

export type GuideStep = { text: string; scene: GuideScene; note?: string };

/** La app instalada en iPhone guarda su propia sesión: al abrirla por primera vez hay que volver a iniciar sesión. */
export const IOS_LOGIN_NOTE = "La app instalada guarda su propia sesión: al abrirla por primera vez, iniciá sesión de nuevo y entrá en Notificaciones.";

const ALLOW: Record<Device["platform"], GuideScene> = { ios: "ios-allow", android: "android-allow", desktop: "desktop-allow" };
const UNBLOCK: Record<Device["platform"], GuideScene> = { ios: "ios-unblock", android: "android-unblock", desktop: "desktop-unblock" };

/** Los pasos (con su ilustración) que le corresponden a esta persona ahora; vacío si no hay nada que mostrar (ya activos, sin soporte). */
export function guideFor(kind: PushStatus["kind"], device: Device): GuideStep[] {
  switch (kind) {
    case "ios_install":
    case "ios_safari": {
      const scenes: GuideScene[] = ["ios-safari", "ios-share", "ios-add", "ios-home"];
      return IOS_INSTALL_STEPS.map((text, i) => ({ text, scene: scenes[i]!, ...(i === IOS_INSTALL_STEPS.length - 1 ? { note: IOS_LOGIN_NOTE } : {}) }));
    }
    case "ready":
    case "granted":
      return [{ text: "Tocá «Activar avisos» y, cuando el navegador te lo pregunte, elegí «Permitir».", scene: ALLOW[device.platform] }];
    case "denied":
      return unblockSteps(device).map((text) => ({ text, scene: UNBLOCK[device.platform] }));
    default:
      return [];
  }
}
