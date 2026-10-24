/**
 * Color de la barra del sistema del navegador (`theme-color`: isla dinámica / barra de estado en el celular). Tiene
 * que coincidir con `--bg` de `globals.css` para que la página y la barra se vean como una sola superficie. Lo
 * comparten `layout.tsx` (lo escribe en el HTML) y `ThemeColorSync` (lo corrige al cambiar el tema a mano).
 */
export const THEME_COLORS = {
  light: "#f6f3ed",
  dark: "#0e0f11",
} as const;
