"use client";

import { useEffect } from "react";
import { THEME_COLORS } from "@/config/theme";

/**
 * Mantiene el `theme-color` (barra de estado / isla dinámica) alineado con el tema que la persona eligió con el
 * botón. Las etiquetas que escribe Next siguen la preferencia del sistema (`prefers-color-scheme`), no el botón:
 * sin esto, alguien con el sistema en claro que elige oscuro vería una barra clara sobre una página oscura.
 * Sin elección manual (`data-theme` ausente) restaura el valor original de cada etiqueta.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const root = document.documentElement;

    function apply() {
      const explicit = root.getAttribute("data-theme");
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        // Se guarda el valor original una vez para poder volver a él si se quita la elección manual.
        if (meta.dataset.original === undefined) meta.dataset.original = meta.content;
        const next = explicit === "light" || explicit === "dark" ? THEME_COLORS[explicit] : meta.dataset.original;
        if (meta.content !== next) meta.content = next;
      }
    }

    apply();
    const attrs = new MutationObserver(apply);
    attrs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    // Next reemplaza las etiquetas al navegar entre rutas con distinto `viewport`: se vuelve a aplicar.
    const head = new MutationObserver(apply);
    head.observe(document.head, { childList: true });
    return () => {
      attrs.disconnect();
      head.disconnect();
    };
  }, []);

  return null;
}
