// AI ↔ canvas hybrid bridge.
// translateLegacy: maps existing whiteboard_elements JSON to React Flow nodes.
// applyNative: pass-through for AI-emitted native node records.
import type { CanvasNode, CanvasEdge, CanvasNodeData } from "./types";

type LegacyElement = {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x?: number; y?: number };
  source?: string;
};

const LEGACY_TYPE_MAP: Record<string, string> = {
  flow_step: "wireframeSlot",
  idea: "sticky",
  decision: "sticky",
  question: "sticky",
  theme: "sticky",
  sticky: "sticky",
  rect: "rect",
  ellipse: "ellipse",
  text: "text",
  note: "sticky",
};

let counter = 0;
function makeId(prefix = "n"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function translateLegacy(el: LegacyElement): CanvasNode | null {
  if (!el || typeof el !== "object") return null;
  const type = LEGACY_TYPE_MAP[el.type ?? ""] ?? "sticky";
  const id = el.id ?? makeId();
  const pos = el.position ?? {};
  const data = (el.data ?? {}) as Record<string, unknown>;
  const label =
    (data.label as string) ?? (data.text as string) ?? (data.body as string) ?? "";
  const meta: CanvasNodeData["meta"] = {
    source: el.source === "ai" ? "ai" : "user",
    lockMode: "open",
  };
  return {
    id,
    type,
    position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
    data: { meta, label, ...data },
  };
}

export function translateLegacyAll(elements: LegacyElement[]): {
  nodes: CanvasNode[];
  errors: { source: string; error: string; payload: unknown }[];
} {
  const nodes: CanvasNode[] = [];
  const errors: { source: string; error: string; payload: unknown }[] = [];
  for (const el of elements) {
    try {
      const n = translateLegacy(el);
      if (n) nodes.push(n);
    } catch (e) {
      errors.push({
        source: "translateLegacy",
        error: e instanceof Error ? e.message : String(e),
        payload: el,
      });
    }
  }
  return { nodes, errors };
}

export type NativeShapeRecord = {
  id?: string;
  type:
    | "wireframeFrame"
    | "journeyStep"
    | "callout"
    | "speechBubble"
    | "sticky"
    | "rect"
    | "ellipse"
    | "text";
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  meta?: Partial<CanvasNodeData["meta"]>;
};

export function applyNative(record: NativeShapeRecord): CanvasNode {
  const id = record.id ?? makeId(record.type);
  const meta: CanvasNodeData["meta"] = {
    source: "ai",
    lockMode: "open",
    ...(record.meta ?? {}),
  };
  return {
    id,
    type: record.type,
    position: record.position ?? { x: 0, y: 0 },
    data: { meta, ...(record.data ?? {}) },
  };
}

export type NativeEdgeRecord = {
  id?: string;
  source: string;
  target: string;
  label?: string;
};

export function applyNativeEdge(rec: NativeEdgeRecord): CanvasEdge {
  return {
    id: rec.id ?? `e_${rec.source}__${rec.target}`,
    source: rec.source,
    target: rec.target,
    label: rec.label,
    type: "smoothstep",
    animated: false,
  };
}
