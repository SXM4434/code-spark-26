// Shared types for the Phase 1 canvas.
import type { Node, Edge } from "@xyflow/react";

export type LockMode = "open" | "augment-only" | "hard";
export type ShapeSource = "ai" | "user" | "co";

export type CanvasMeta = {
  source: ShapeSource;
  lockMode: LockMode;
  /** Frame index for the storyboard (Phase 2). Default 0. */
  frame?: number;
  /** Free summary the AI uses when re-reading the canvas. */
  summary?: string;
};

export type CanvasNodeData = {
  meta: CanvasMeta;
  // Per-shape fields handled by the custom node component.
  [k: string]: unknown;
};

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;

export type CanvasEventKind =
  | "node.add"
  | "node.update"
  | "node.remove"
  | "edge.add"
  | "edge.update"
  | "edge.remove";

export type CanvasEventRow = {
  id: string;
  session_id: string;
  actor_id: string | null;
  kind: CanvasEventKind;
  shape_id: string | null;
  payload: Record<string, unknown>;
  t_offset_ms: number;
  created_at: string;
};
