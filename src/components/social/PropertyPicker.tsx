"use client";

import { Sheet } from "@/components/ui/Sheet";

export type PickableProperty = { id: string; title: string; photo: string };

/** Lista de propiedades para elegir cuál promocionar (un cajón). `layer="overlay"` cuando se abre sobre el escenario de un agente. */
export function PropertyPicker({
  open,
  onClose,
  properties,
  disabled,
  onPick,
  layer = "page",
}: {
  open: boolean;
  onClose: () => void;
  properties: PickableProperty[];
  disabled?: boolean;
  onPick: (id: string) => void;
  layer?: "page" | "overlay";
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Elegir propiedad" layer={layer}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {properties.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(p.id)}
              className="flex w-full items-center gap-3 rounded-media p-2 text-left transition-[background-color,transform] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-surface-2 active:scale-[0.98]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo} alt="" className="h-14 w-14 shrink-0 rounded-media object-cover" />
              <span className="line-clamp-2 text-sm font-medium text-text">{p.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
