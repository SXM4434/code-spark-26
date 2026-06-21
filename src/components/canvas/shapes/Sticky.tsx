import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "@/lib/canvas/types";

type Data = CanvasNodeData & { label?: string };

export function Sticky({ data, selected }: NodeProps & { data: Data }) {
  return (
    <div
      className="canvas-card"
      style={{
        width: 160,
        minHeight: 100,
        background: "oklch(0.85 0.14 90)",
        color: "oklch(0.2 0 0)",
        borderColor: "oklch(0.65 0.14 90)",
        outline: selected ? "2px solid var(--canvas-accent)" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="body" style={{ color: "oklch(0.2 0 0)" }}>{data.label ?? "Sticky"}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
