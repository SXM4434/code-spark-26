import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "@/lib/canvas/types";

type Data = CanvasNodeData & { quote?: string; attribution?: string };

export function SpeechBubble({ data, selected }: NodeProps & { data: Data }) {
  return (
    <div
      className="canvas-card"
      style={{ width: 220, outline: selected ? "2px solid var(--canvas-accent)" : "none" }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 15, fontStyle: "italic", lineHeight: 1.35 }}>
        "{data.quote ?? "…"}"
      </div>
      {data.attribution && (
        <div className="eyebrow" style={{ marginTop: 8 }}>— {data.attribution}</div>
      )}
    </div>
  );
}
