// Hook: keeps a React Flow node/edge list in sync with the canvas_events op log
// via Supabase Realtime. Local changes commit ops; remote ops merge into state.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CanvasNode, CanvasEdge, CanvasEventKind } from "./types";

type SyncArgs = {
  sessionId: string;
  actorId: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  setNodes: (updater: (prev: CanvasNode[]) => CanvasNode[]) => void;
  setEdges: (updater: (prev: CanvasEdge[]) => CanvasEdge[]) => void;
};

export async function commitOp(
  sessionId: string,
  actorId: string | null,
  kind: CanvasEventKind,
  shapeId: string | null,
  payload: Record<string, unknown>,
  startedAt: number,
): Promise<void> {
  const t_offset_ms = Date.now() - startedAt;
  await supabase.from("canvas_events").insert({
    session_id: sessionId,
    actor_id: actorId,
    kind,
    shape_id: shapeId,
    payload,
    t_offset_ms,
  });
}

export function useCanvasSync({ sessionId, actorId, setNodes, setEdges }: SyncArgs): {
  startedAtRef: React.MutableRefObject<number>;
} {
  const startedAtRef = useRef<number>(Date.now());
  const ownActorRef = useRef<string | null>(actorId);
  ownActorRef.current = actorId;

  // Hydrate from existing canvas_events on mount.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("canvas_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (!mounted || !data) return;
      const nodes = new Map<string, CanvasNode>();
      const edges = new Map<string, CanvasEdge>();
      for (const row of data) {
        applyOpToMaps(row.kind as CanvasEventKind, row.shape_id, row.payload as Record<string, unknown>, nodes, edges);
      }
      setNodes(() => Array.from(nodes.values()));
      setEdges(() => Array.from(edges.values()));
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId, setNodes, setEdges]);

  // Subscribe to live events.
  useEffect(() => {
    const channel = supabase
      .channel(`canvas:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "canvas_events", filter: `session_id=eq.${sessionId}` },
        (msg) => {
          const row = msg.new as {
            kind: CanvasEventKind;
            shape_id: string | null;
            payload: Record<string, unknown>;
            actor_id: string | null;
          };
          // Ignore our own ops — already applied optimistically.
          if (row.actor_id && row.actor_id === ownActorRef.current) return;
          setNodes((prev) => {
            const map = new Map(prev.map((n) => [n.id, n] as const));
            const eMap = new Map<string, CanvasEdge>();
            applyOpToMaps(row.kind, row.shape_id, row.payload, map, eMap);
            return Array.from(map.values());
          });
          setEdges((prev) => {
            const eMap = new Map(prev.map((e) => [e.id, e] as const));
            const nMap = new Map<string, CanvasNode>();
            applyOpToMaps(row.kind, row.shape_id, row.payload, nMap, eMap);
            return Array.from(eMap.values());
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, setNodes, setEdges]);

  return { startedAtRef };
}

function applyOpToMaps(
  kind: CanvasEventKind,
  shapeId: string | null,
  payload: Record<string, unknown>,
  nodes: Map<string, CanvasNode>,
  edges: Map<string, CanvasEdge>,
): void {
  switch (kind) {
    case "node.add": {
      const node = payload.node as CanvasNode | undefined;
      if (node && node.id) nodes.set(node.id, node);
      break;
    }
    case "node.update": {
      if (!shapeId) break;
      const existing = nodes.get(shapeId);
      const patch = (payload.patch ?? {}) as Partial<CanvasNode>;
      if (existing) nodes.set(shapeId, { ...existing, ...patch, data: { ...existing.data, ...(patch.data ?? {}) } });
      break;
    }
    case "node.remove": {
      if (shapeId) nodes.delete(shapeId);
      break;
    }
    case "edge.add": {
      const edge = payload.edge as CanvasEdge | undefined;
      if (edge && edge.id) edges.set(edge.id, edge);
      break;
    }
    case "edge.update": {
      if (!shapeId) break;
      const existing = edges.get(shapeId);
      const patch = (payload.patch ?? {}) as Partial<CanvasEdge>;
      if (existing) edges.set(shapeId, { ...existing, ...patch });
      break;
    }
    case "edge.remove": {
      if (shapeId) edges.delete(shapeId);
      break;
    }
  }
}
