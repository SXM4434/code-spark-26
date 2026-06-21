import "@/styles/canvas.css";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { useAuth } from "@/hooks/use-auth";
import { commitOp, useCanvasSync } from "@/lib/canvas/use-canvas-sync";
import { applyNative } from "@/lib/canvas/ai-bridge";
import type { CanvasEdge, CanvasNode } from "@/lib/canvas/types";

import { WireframeFrame } from "./shapes/WireframeFrame";
import { JourneyStep } from "./shapes/JourneyStep";
import { Callout } from "./shapes/Callout";
import { SpeechBubble } from "./shapes/SpeechBubble";
import { Sticky } from "./shapes/Sticky";
import { Toolbar, type Tool } from "./Toolbar";
import { CostMeter } from "./CostMeter";

const ExcalidrawLayer = lazy(() => import("./ExcalidrawLayer"));

const NODE_TYPES = {
  wireframeFrame: WireframeFrame,
  journeyStep: JourneyStep,
  callout: Callout,
  speechBubble: SpeechBubble,
  sticky: Sticky,
  // legacy alias from translateLegacy
  wireframeSlot: Sticky,
};

type Props = { sessionId: string };

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ sessionId }: Props) {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [sketchActive, setSketchActive] = useState(false);

  const { startedAtRef } = useCanvasSync({
    sessionId,
    actorId: user?.id ?? null,
    nodes,
    edges,
    setNodes,
    setEdges,
  });

  const actorId = user?.id ?? null;

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds) as CanvasNode[];
        // Persist meaningful changes.
        for (const ch of changes) {
          if (ch.type === "position" && !ch.dragging) {
            const n = next.find((x) => x.id === ch.id);
            if (n) {
              // Flip AI-owned shape to co-edit on user move.
              if (n.data?.meta?.source === "ai") {
                n.data = {
                  ...n.data,
                  meta: { ...n.data.meta, source: "co", lockMode: "augment-only" },
                };
              }
              void commitOp(sessionId, actorId, "node.update", n.id, { patch: { position: n.position, data: n.data } }, startedAtRef.current);
            }
          } else if (ch.type === "remove") {
            void commitOp(sessionId, actorId, "node.remove", ch.id, {}, startedAtRef.current);
          }
        }
        return next;
      });
    },
    [sessionId, actorId, startedAtRef],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        for (const ch of changes) {
          if (ch.type === "remove") {
            void commitOp(sessionId, actorId, "edge.remove", ch.id, {}, startedAtRef.current);
          }
        }
        return next;
      });
    },
    [sessionId, actorId, startedAtRef],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...c, type: "smoothstep" }, eds);
        const added = next.find((e) => !eds.includes(e));
        if (added) void commitOp(sessionId, actorId, "edge.add", added.id, { edge: added }, startedAtRef.current);
        return next;
      });
    },
    [sessionId, actorId, startedAtRef],
  );

  const handleAdd = useCallback(
    (kind: "sticky" | "wireframe" | "journey" | "callout" | "speech") => {
      const typeMap = {
        sticky: "sticky",
        wireframe: "wireframeFrame",
        journey: "journeyStep",
        callout: "callout",
        speech: "speechBubble",
      } as const;
      const center = { x: 200 + Math.random() * 240, y: 140 + Math.random() * 200 };
      const node = applyNative({
        type: typeMap[kind],
        position: center,
        data:
          kind === "sticky"
            ? { label: "New sticky" }
            : kind === "wireframe"
            ? { title: "New screen", device: "desktop", slots: ["Header", "Body", "CTA"] }
            : kind === "journey"
            ? { step: 1, label: "Step", emotion: 0 }
            : kind === "callout"
            ? { body: "Note" }
            : { quote: "Something insightful", attribution: "You" },
        meta: { source: "user", lockMode: "open" },
      });
      setNodes((prev) => [...prev, node]);
      void commitOp(sessionId, actorId, "node.add", node.id, { node }, startedAtRef.current);
    },
    [sessionId, actorId, startedAtRef],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: CanvasNode) => {
      e.preventDefault();
      const current = node.data?.meta?.lockMode ?? "open";
      const next = current === "hard" ? "open" : "hard";
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, meta: { ...n.data.meta, lockMode: next } } }
            : n,
        ),
      );
      void commitOp(
        sessionId,
        actorId,
        "node.update",
        node.id,
        { patch: { data: { ...node.data, meta: { ...node.data.meta, lockMode: next } } } },
        startedAtRef.current,
      );
    },
    [sessionId, actorId, startedAtRef],
  );

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  return (
    <div className="canvas-shell">
      <Toolbar
        active={tool}
        onChange={setTool}
        onAdd={handleAdd}
        sketchActive={sketchActive}
        onToggleSketch={() => setSketchActive((s) => !s)}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} size={1} color="oklch(0.3 0 0)" />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {sketchActive && (
        <Suspense fallback={null}>
          <div className="canvas-sketch-layer">
            <ExcalidrawLayer />
          </div>
        </Suspense>
      )}
      <CostMeter sessionId={sessionId} />
      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            color: "var(--canvas-muted)",
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 22,
            fontStyle: "italic",
          }}
        >
          Speak, sketch, or drop a shape — Cartoonist draws alongside you.
        </div>
      )}
    </div>
  );
}
