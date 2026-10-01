"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Flag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { layoutScenes, sceneName, type TourScene } from "@/components/tour/tour-types";

type SceneNodeData = { label: string; url: string; isStart: boolean; isCurrent: boolean; linkCount: number };
type SceneNode = Node<SceneNodeData, "scene">;

const NODE_W = 200;
const COL_GAP = 120;
const ROW_GAP = 40;

/** Nodo = una foto 360° con miniatura, título y cantidad de marcadores. */
function SceneNodeView({ data }: NodeProps<SceneNode>) {
  return (
    <div
      className={cn(
        "w-[200px] overflow-hidden rounded-media border bg-surface text-text shadow-card",
        data.isCurrent ? "border-accent ring-2 ring-accent/30" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-accent" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.url} alt="" loading="lazy" draggable={false} className="aspect-[16/10] w-full bg-surface-2 object-cover" />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
          {data.isStart && <Flag className="h-3 w-3 shrink-0 text-accent" aria-label="Foto de inicio" />}
          <span className="truncate">{data.label}</span>
        </span>
        <span className="shrink-0 text-xs text-text-muted">{data.linkCount} →</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-accent" />
    </div>
  );
}

const nodeTypes = { scene: SceneNodeView };

/** Posiciones iniciales (px) a partir de la grilla BFS compartida. */
function autoLayout(scenes: TourScene[], startId: string | undefined): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, { col, row }] of layoutScenes(scenes, startId)) {
    out.set(id, { x: col * (NODE_W + COL_GAP), y: row * (NODE_W * 0.8 + ROW_GAP + 40) });
  }
  return out;
}

/**
 * Vista de nodos del recorrido (estilo Blender): cada foto es un nodo y cada
 * marcador una flecha hacia la foto a la que lleva. Permite reordenar los
 * nodos (se guarda la posición), abrir una foto para editarla y borrar
 * conexiones.
 */
export function TourGraph({
  scenes,
  startId,
  currentId,
  onOpenScene,
  onMoveNode,
  onDeleteLink,
  onClose,
}: {
  scenes: TourScene[];
  startId?: string;
  currentId: string;
  onOpenScene: (id: string) => void;
  onMoveNode: (id: string, pos: { x: number; y: number }) => void;
  onDeleteLink: (sceneId: string, linkId: string) => void;
  onClose: () => void;
}) {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const explicit = root.getAttribute("data-theme");
    const isDark = explicit ? explicit === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    Promise.resolve().then(() => setDark(isDark));
  }, []);

  const layout = useMemo(() => autoLayout(scenes, startId), [scenes, startId]);

  const toNodes = useCallback(
    (prev: SceneNode[] = []): SceneNode[] =>
      scenes.map((s, i) => ({
        id: s.id,
        type: "scene" as const,
        // Prioridad: posición que el usuario está arrastrando ahora > guardada > automática.
        position: prev.find((n) => n.id === s.id)?.position ?? s.graph ?? layout.get(s.id) ?? { x: 0, y: 0 },
        data: {
          label: sceneName(s, i),
          url: s.photo360Url,
          isStart: s.id === (startId ?? scenes[0]?.id),
          isCurrent: s.id === currentId,
          linkCount: s.links.length,
        },
      })),
    [scenes, startId, currentId, layout]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SceneNode>(toNodes());
  useEffect(() => {
    setNodes((prev) => toNodes(prev));
  }, [toNodes, setNodes]);

  const edges: Edge[] = useMemo(
    () =>
      scenes.flatMap((s) =>
        s.links.map((l) => ({
          id: `${s.id}::${l.id}`,
          source: s.id,
          target: l.targetId,
          label: l.label || undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
          selected: `${s.id}::${l.id}` === selectedEdge,
          style: { strokeWidth: 2 },
        }))
      ),
    [scenes, selectedEdge]
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Vista de nodos del recorrido" className="absolute inset-0 z-20 flex flex-col bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-text">Mapa del recorrido</h3>
          <p className="truncate text-xs text-text-muted">
            Arrastrá los nodos para ordenarlos. Tocá una foto para editarla o una flecha para quitar esa conexión.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedEdge && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                const [sceneId, linkId] = selectedEdge.split("::");
                onDeleteLink(sceneId, linkId);
                setSelectedEdge(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar conexión
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            <X className="h-3.5 w-3.5" aria-hidden /> Cerrar
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => onMoveNode(node.id, node.position)}
          onNodeClick={(_, node) => {
            setSelectedEdge(null);
            onOpenScene(node.id);
          }}
          onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
          onPaneClick={() => setSelectedEdge(null)}
          nodesConnectable={false}
          deleteKeyCode={null}
          colorMode={dark ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
