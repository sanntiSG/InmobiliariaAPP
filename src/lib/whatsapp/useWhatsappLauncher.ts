"use client";

import { useCallback, useRef } from "react";

/**
 * Abre WhatsApp automáticamente DESPUÉS de una operación asíncrona (guardar un
 * formulario) sin que el navegador lo trate como un popup no pedido.
 *
 * Los navegadores sólo dejan abrir ventanas dentro del clic de la persona; si
 * se espera al `fetch` y recién ahí se hace `window.open`, lo bloquean. La
 * solución: reservar la pestaña **en el mismo clic** (`reserve`), y cuando el
 * guardado termina mandarla a WhatsApp (`launch`); si falló, cerrarla
 * (`cancel`). Si igual la bloquearon, `launch` devuelve `false` y la pantalla
 * debe mostrar un botón con el link como respaldo.
 */
export function useWhatsappLauncher() {
  const tab = useRef<Window | null>(null);

  const reserve = useCallback(() => {
    try {
      const w = window.open("", "_blank");
      if (!w) {
        tab.current = null;
        return;
      }
      w.opener = null;
      w.document.title = "Abriendo WhatsApp…";
      w.document.body.style.cssText = "font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#555";
      w.document.body.textContent = "Abriendo WhatsApp…";
      tab.current = w;
    } catch {
      tab.current = null;
    }
  }, []);

  const launch = useCallback((url: string): boolean => {
    const w = tab.current;
    tab.current = null;
    if (!w || w.closed) return false;
    w.location.href = url;
    return true;
  }, []);

  const cancel = useCallback(() => {
    try {
      tab.current?.close();
    } finally {
      tab.current = null;
    }
  }, []);

  return { reserve, launch, cancel };
}
