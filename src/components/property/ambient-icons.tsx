import { CloudRain, Moon, Sparkles, Sun, Sunset, Wind, type LucideIcon } from "lucide-react";

/** Ícono de cada estado de la portada viva (ids que usa el proveedor); uno genérico para cualquier otro. */
const ICONS: Record<string, LucideIcon> = {
  day: Sun,
  dusk: Sunset,
  night: Moon,
  rain: CloudRain,
  wind: Wind,
};

export function AmbientStateIcon({ id, className }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? Sparkles;
  return <Icon className={className ?? "h-4 w-4"} aria-hidden />;
}
