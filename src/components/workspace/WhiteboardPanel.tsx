import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type Element = {
  id: string;
  type: string;
  data: { label?: string; kind?: string };
  position: { x: number; y: number };
  source: "user" | "ai";
  created_by: string | null;
};

const KIND_COLORS: Record<string, string> = {
  idea: "bg-accent",
  theme: "bg-secondary",
  decision: "bg-highlight",
  question: "bg-primary text-primary-foreground",
  sticky: "bg-card",
};

export function WhiteboardPanel({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [els, setEls] = useState<Element[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<keyof typeof KIND_COLORS>("idea");
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whiteboard_elements")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      setEls((data as Element[]) ?? []);
    })();
    const ch = supabase
      .channel(`wb:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_elements", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setEls((prev) => {
            if (payload.eventType === "INSERT") return [...prev, payload.new as Element];
            if (payload.eventType === "UPDATE") return prev.map((e) => (e.id === (payload.new as Element).id ? (payload.new as Element) : e));
            if (payload.eventType === "DELETE") return prev.filter((e) => e.id !== (payload.old as Element).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  async function addSticky(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    const t = text.trim();
    setText("");
    const x = 60 + Math.floor(Math.random() * 240);
    const y = 60 + Math.floor(Math.random() * 200);
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: kind,
      data: { label: t, kind },
      position: { x, y },
      source: "user",
      created_by: user.id,
    });
  }

  function onDown(e: React.PointerEvent, el: Element) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = boardRef.current!.getBoundingClientRect();
    dragRef.current = {
      id: el.id,
      ox: e.clientX - rect.left - el.position.x,
      oy: e.clientY - rect.top - el.position.y,
    };
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const nx = Math.max(0, Math.min(rect.width - 140, e.clientX - rect.left - d.ox));
    const ny = Math.max(0, Math.min(rect.height - 80, e.clientY - rect.top - d.oy));
    setEls((prev) => prev.map((el) => (el.id === d.id ? { ...el, position: { x: nx, y: ny } } : el)));
  }
  async function onUp() {
    const d = dragRef.current;
    if (!d) return;
    const moved = els.find((e) => e.id === d.id);
    dragRef.current = null;
    if (moved) {
      await supabase
        .from("whiteboard_elements")
        .update({ position: moved.position })
        .eq("id", moved.id);
    }
  }

  async function remove(id: string) {
    await supabase.from("whiteboard_elements").delete().eq("id", id);
  }

  return (
    <div className="sticker flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink">Whiteboard</h3>
        <span className="rounded-full bg-accent px-2 py-0.5 font-display text-xs">{els.length}</span>
      </div>

      <form onSubmit={addSticky} className="mt-3 flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as keyof typeof KIND_COLORS)}
          className="sticker-sm bg-card px-2 py-2 text-sm"
        >
          <option value="idea">💡 idea</option>
          <option value="theme">🎨 theme</option>
          <option value="decision">✅ decision</option>
          <option value="question">❓ question</option>
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Drop a sticky…"
          className="sticker-sm flex-1 bg-card px-3 py-2 text-sm outline-none"
        />
        <Button type="submit" className="doodle-btn rounded-full bg-primary">Drop</Button>
      </form>

      <div
        ref={boardRef}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative mt-3 flex-1 overflow-hidden rounded-2xl border-2 border-dashed border-ink/20 bg-[radial-gradient(circle,_#0001_1px,_transparent_1px)] bg-[size:18px_18px]"
      >
        {els.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Cartoonist will start sketching here as the conversation goes — or drop your own sticky above.
          </div>
        )}
        {els.map((el) => {
          const color = KIND_COLORS[el.data?.kind ?? el.type] ?? "bg-card";
          const mine = el.created_by === user?.id;
          const ai = el.source === "ai";
          return (
            <div
              key={el.id}
              onPointerDown={(e) => onDown(e, el)}
              style={{ left: el.position.x, top: el.position.y }}
              className={`sticker-sm absolute w-36 cursor-grab touch-none p-2 text-xs ${color} ${ai ? "ring-2 ring-primary/60" : ""}`}
            >
              <div className="flex items-center justify-between text-[9px] opacity-70">
                <span className="font-display">{ai ? "✦ Cartoonist" : "you"}</span>
                {(mine || ai) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(el.id); }}
                    className="text-[10px] hover:text-primary"
                  >×</button>
                )}
              </div>
              <div className="mt-1 leading-snug">{el.data?.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
