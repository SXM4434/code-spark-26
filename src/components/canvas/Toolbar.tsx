type Tool = "select" | "sticky" | "wireframe" | "journey" | "callout" | "speech" | "sketch";

type Props = {
  active: Tool;
  onChange: (t: Tool) => void;
  onAdd: (t: Exclude<Tool, "select" | "sketch">) => void;
  sketchActive: boolean;
  onToggleSketch: () => void;
};

const TOOLS: { id: Tool; label: string; icon: string; addable?: boolean }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "sticky", label: "Sticky", icon: "▣", addable: true },
  { id: "wireframe", label: "Wireframe", icon: "▢", addable: true },
  { id: "journey", label: "Journey step", icon: "↦", addable: true },
  { id: "callout", label: "Callout", icon: "✱", addable: true },
  { id: "speech", label: "Speech", icon: "❝", addable: true },
];

export function Toolbar({ active, onChange, onAdd, sketchActive, onToggleSketch }: Props) {
  return (
    <div className="canvas-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          data-active={active === t.id}
          onClick={() => {
            onChange(t.id);
            if (t.addable && t.id !== "select") onAdd(t.id as Exclude<Tool, "select" | "sketch">);
          }}
        >
          {t.icon}
        </button>
      ))}
      <div style={{ height: 1, background: "var(--canvas-border)", margin: "4px 0" }} />
      <button
        title="Freeform sketch"
        data-active={sketchActive}
        onClick={onToggleSketch}
      >
        ✎
      </button>
    </div>
  );
}

export type { Tool };
