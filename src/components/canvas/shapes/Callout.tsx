import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "@/lib/canvas/types";

type Data = CanvasNodeData & { body?: string };

export function Callout({ data, selected }: NodeProps & { data: Data }) {
  return (
    <div
      className="canvas-card"
      style={{
        width: 200,
        background: "var(--canvas-accent-soft)",
        borderColor: "var(--canvas-accent)",
        outline: selected ? "2px solid var(--canvas-accent)" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="eyebrow" style={{ color: "var(--canvas-accent)" }}>callout</div>
      <div className="body">{data.body ?? "Note from Cartoonist"}</div>
    </div>
  );
}
