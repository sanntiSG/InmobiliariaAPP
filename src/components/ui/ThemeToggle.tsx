"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "@/lib/utils/cn";
import { THEME_COOKIE_NAME } from "@/config/site";

type ThemeChoice = "light" | "dark";

function getSystemTheme(): ThemeChoice {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Toggle claro/oscuro. `layout.tsx` ya setea data-theme antes de hidratar
 * (lee la cookie en el servidor — evita flash incluso en cargas de página
 * completas, no sólo navegación soft); acá solo leemos ese estado y lo
 * actualizamos al click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    // Leer `document` solo puede pasar después de montar (server no tiene
    // DOM) — es sincronizar con un sistema externo, no derivar de props.
    const attr = document.documentElement.getAttribute("data-theme") as ThemeChoice | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(attr ?? getSystemTheme());
  }, []);

  function toggle() {
    const next: ThemeChoice = (theme ?? getSystemTheme()) === "dark" ? "light" : "dark";
    setTheme(next);
    // Cookie = fuente de verdad para la próxima carga completa (el servidor
    // la lee en `layout.tsx`, ver ese archivo). `localStorage` se mantiene
    // además, barato, como respaldo si algún navegador bloquea cookies pero
    // no localStorage — el script de `layout.tsx` migra desde ahí.
    try {
      localStorage.setItem(THEME_COOKIE_NAME, next);
    } catch {
      // localStorage puede fallar en navegación privada — el toggle sigue funcionando en memoria.
    }
    document.cookie = `${THEME_COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.setAttribute("data-theme", next);
  }

  const isDark = theme === "dark";

  return (
    <IconButton
      variant="ghost"
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      onClick={toggle}
    >
      <span className="relative block h-[18px] w-[18px]">
        <Sun
          className={cn(
            "absolute inset-0 transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)]",
            isDark ? "opacity-0 -rotate-45 scale-75" : "opacity-100 rotate-0 scale-100"
          )}
          aria-hidden
        />
        <Moon
          className={cn(
            "absolute inset-0 transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)]",
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-45 scale-75"
          )}
          aria-hidden
        />
      </span>
    </IconButton>
  );
}
