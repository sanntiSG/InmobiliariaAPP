"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "@/lib/utils/cn";

type ThemeChoice = "light" | "dark";

const STORAGE_KEY = "umbral-theme";

function getSystemTheme(): ThemeChoice {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Toggle claro/oscuro. `layout.tsx` ya setea data-theme antes de hidratar
 * (evita flash); acá solo leemos ese estado y lo actualizamos al click.
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
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage puede fallar en navegación privada — el toggle sigue funcionando en memoria.
    }
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
