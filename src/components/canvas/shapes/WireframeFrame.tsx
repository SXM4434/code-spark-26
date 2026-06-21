import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "@/lib/canvas/types";

type Data = CanvasNodeData & {
  device?: "mobile" | "desktop";
  title?: string;
  slots?: string[];
};

export function WireframeFrame({ data, selected }: NodeProps & { data: Data }) {
  const device = data.device ?? "desktop";
  const slots = data.slots ?? ["Header", "Hero", "Body", "CTA"];
  const w = device === "mobile" ? 220 : 340;
  return (
    <div
      className="canvas-card"
      style={{ width: w, padding: 0, outline: selected ? "2px solid var(--canvas-accent)" : "none" }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--canvas-border)" }}>
        <div className="eyebrow">{device} wireframe</div>
        <div className="title">{data.title ?? "Untitled screen"}</div>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        {slots.map((s, i) => (
          <div
            key={i}
            style={{
              border: "1px dashed var(--canvas-border)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--canvas-muted)",
            }}
          >
            {s}
          </div>
        ))}
      </div>
      <LockBadge mode={data.meta?.lockMode} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function LockBadge({ mode }: { mode?: string }) {
  if (!mode || mode === "open") return null;
  return (
    <div className="canvas-lock" data-mode={mode}>
      {mode === "hard" ? "locked" : "riff"}
    </div>
  );
}
