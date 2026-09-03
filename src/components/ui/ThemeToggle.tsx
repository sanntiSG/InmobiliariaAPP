"use client";

import { useEffect, useState } from "react";
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
        <SunIcon
          className={cn(
            "absolute inset-0 transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)]",
            isDark ? "opacity-0 -rotate-45 scale-75" : "opacity-100 rotate-0 scale-100"
          )}
        />
        <MoonIcon
          className={cn(
            "absolute inset-0 transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)]",
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-45 scale-75"
          )}
        />
      </span>
    </IconButton>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
