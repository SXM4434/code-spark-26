import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "@/lib/canvas/types";

type Data = CanvasNodeData & {
  step?: number;
  label?: string;
  emotion?: number; // -1 .. 1
  touchpoint?: string;
};

export function JourneyStep({ data, selected }: NodeProps & { data: Data }) {
  const e = Math.max(-1, Math.min(1, data.emotion ?? 0));
  const pct = ((e + 1) / 2) * 100;
  return (
    <div
      className="canvas-card"
      style={{ width: 200, outline: selected ? "2px solid var(--canvas-accent)" : "none" }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="eyebrow">Step {data.step ?? "•"}</div>
      <div className="title" style={{ fontSize: 15 }}>{data.label ?? "Step label"}</div>
      <div
        style={{
          height: 6,
          marginTop: 8,
          background: "var(--canvas-border)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: e >= 0 ? "var(--canvas-accent)" : "oklch(0.6 0.18 25)",
          }}
        />
      </div>
      {data.touchpoint && (
        <div className="body" style={{ marginTop: 6, color: "var(--canvas-muted)", fontSize: 11 }}>
          {data.touchpoint}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
