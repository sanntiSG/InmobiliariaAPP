"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { layoutScenes, sceneName, type TourScene } from "@/components/tour/tour-types";

const NODE_W = 76;
const NODE_H = 48;
const COL_W = 124;
const ROW_H = 84;
const PAD = 14;

/**
 * Mini mapa de conexiones del panel del editor: un SVG liviano (sin React
 * Flow) con una miniatura por foto y una flecha por cada marcador. Sirve
 * para saltar a cualquier foto con un click sin scrollear la lista, y para
 * ver de un vistazo cómo está organizado el recorrido.
 */
export function TourMiniMap({
  scenes,
  startId,
  currentId,
  onSelect,
}: {
  scenes: TourScene[];
  startId?: string;
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => layoutScenes(scenes, startId), [scenes, startId]);

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, { col, row }] of layout) {
      m.set(id, { x: PAD + col * COL_W, y: PAD + row * ROW_H });
    }
    return m;
  }, [layout]);

  const width = PAD * 2 + Math.max(0, ...[...layout.values()].map((p) => p.col)) * COL_W + NODE_W;
  const height = PAD * 2 + Math.max(0, ...[...layout.values()].map((p) => p.row)) * ROW_H + NODE_H + 16;

  const edges = scenes.flatMap((s) =>
    s.links.flatMap((l) => {
      const a = pos.get(s.id);
      const b = pos.get(l.targetId);
      if (!a || !b) return [];
      const ax = a.x + NODE_W / 2;
      const ay = a.y + NODE_H / 2;
      const bx = b.x + NODE_W / 2;
      const by = b.y + NODE_H / 2;
      // Curva con un pequeño desvío perpendicular: las idas y vueltas entre
      // dos fotos no se pisan (el desvío cambia de signo con la dirección).
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const off = 14;
      const cx = (ax + bx) / 2 + (-dy / len) * off;
      const cy = (ay + by) / 2 + (dx / len) * off;
      return [{ id: `${s.id}::${l.id}`, d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, active: s.id === currentId }];
    })
  );

  return (
    <div className="overflow-x-auto rounded-media border border-border bg-surface-2">
      <svg width={width} height={height} role="group" aria-label="Mapa de conexiones del recorrido" className="block">
        <defs>
          <marker id="mini-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
          </marker>
        </defs>

        <g className="text-text-muted">
          {edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={e.active ? 1.8 : 1.1}
              opacity={e.active ? 0.95 : 0.45}
              markerEnd="url(#mini-arrow)"
            />
          ))}
        </g>

        {scenes.map((s, i) => {
          const p = pos.get(s.id);
          if (!p) return null;
          const current = s.id === currentId;
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`Ir a ${sceneName(s, i)}${s.id === startId ? " (inicio)" : ""}`}
              aria-current={current}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--accent)]"
            >
              <clipPath id={`mini-clip-${s.id}`}>
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} />
              </clipPath>
              <image
                href={s.photo360Url}
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#mini-clip-${s.id})`}
              />
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="none"
                strokeWidth={current ? 3 : 1.5}
                className={cn(current ? "stroke-[var(--accent)]" : "stroke-[var(--border)]")}
              />
              {s.id === startId && (
                <text x={p.x + 6} y={p.y + 14} fontSize={11} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 }}>
                  ⚑
                </text>
              )}
              <text
                x={p.x + NODE_W / 2}
                y={p.y + NODE_H + 13}
                textAnchor="middle"
                fontSize={11}
                fontWeight={current ? 700 : 500}
                className="fill-[var(--text)]"
              >
                {truncate(sceneName(s, i), 13)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
