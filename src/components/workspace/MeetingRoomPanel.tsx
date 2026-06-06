import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Participant = {
  user_id: string;
  display_name: string | null;
  personality_type: string | null;
  online?: boolean;
};

type Element = {
  id: string;
  type: string;
  data: { text?: string; author?: string; role?: string };
  created_at: string;
  created_by: string | null;
  source: string;
};

type Props = {
  sessionId: string;
  participants: Participant[];
  nameMap: Record<string, string>;
};

export function MeetingRoomPanel({ sessionId, participants, nameMap }: Props) {
  const { user } = useAuth();
  const [elements, setElements] = useState<Element[]>([]);
  const [introText, setIntroText] = useState("");
  const [roleText, setRoleText] = useState("");
  const [flowText, setFlowText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const introsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`room:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_elements", filter: `session_id=eq.${sessionId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    introsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [elements.length]);

  async function load() {
    const { data } = await supabase
      .from("whiteboard_elements")
      .select("id,type,data,created_at,created_by,source")
      .eq("session_id", sessionId)
      .in("type", ["intro", "flow_step"])
      .order("created_at", { ascending: true });
    setElements((data ?? []) as Element[]);
  }

  async function postIntro() {
    if (!user || !introText.trim()) return;
    const author = nameMap[user.id] ?? "Someone";
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "intro",
      data: { text: introText.trim(), author, role: roleText.trim() || null },
      position: { x: 0, y: 0 },
      created_by: user.id,
      source: "user",
    });
    setIntroText("");
    setRoleText("");
  }

  async function addFlowStep() {
    if (!user || !flowText.trim()) return;
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "flow_step",
      data: { text: flowText.trim(), author: nameMap[user.id] ?? "Someone" },
      position: { x: 0, y: 0 },
      created_by: user.id,
      source: "user",
    });
    setFlowText("");
  }

  async function removeElement(id: string) {
    await supabase.from("whiteboard_elements").delete().eq("id", id);
  }

  async function suggestFlow() {
    if (!user) return;
    setSuggesting(true);
    try {
      const intros = elements.filter((e) => e.type === "intro");
      if (intros.length === 0) {
        toast.error("Add a few intros first so Cartoonist has something to work with.");
        return;
      }
      const context = intros
        .map((i) => `${i.data.author ?? "Someone"}${i.data.role ? ` (${i.data.role})` : ""}: ${i.data.text}`)
        .join("\n");
      const { data, error } = await supabase.functions.invoke("mediator", {
        body: {
          session_id: sessionId,
          prompt: `Based on these team introductions, sketch a 4-6 step user flow that fits what they're building. Return ONLY a JSON array of short step strings.\n\nIntros:\n${context}`,
          mode: "flow",
        },
      });
      if (error) throw error;
      const raw = (data?.text ?? data?.response ?? "").toString();
      const match = raw.match(/\[[\s\S]*\]/);
      const steps: string[] = match ? JSON.parse(match[0]) : [];
      for (const step of steps.slice(0, 8)) {
        await supabase.from("whiteboard_elements").insert({
          session_id: sessionId,
          type: "flow_step",
          data: { text: step, author: "Cartoonist" },
          position: { x: 0, y: 0 },
          created_by: user.id,
          source: "ai",
        });
      }
      toast.success(`Cartoonist sketched ${steps.length} steps`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sketch the flow");
    } finally {
      setSuggesting(false);
    }
  }

  const intros = elements.filter((e) => e.type === "intro");
  const flow = elements.filter((e) => e.type === "flow_step");

  return (
    <div className="grid h-full gap-4 lg:grid-cols-2">
      {/* LEFT — Room & intros */}
      <section className="doodle-card flex h-full min-h-0 flex-col rounded-3xl bg-card p-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" />
            <div>
              <h2 className="font-display text-lg font-bold text-ink">In the room</h2>
              <p className="text-xs text-muted-foreground">{participants.length} here · introductions captured live</p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {participants.slice(0, 6).map((p) => (
              <div
                key={p.user_id}
                title={p.display_name ?? "Someone"}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-accent font-display text-xs font-bold text-ink"
              >
                {(p.display_name ?? "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {participants.length > 6 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-semibold">
                +{participants.length - 6}
              </div>
            )}
          </div>
        </header>

        <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {intros.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No intros yet. Be the first to say hi 👋
            </div>
          )}
          {intros.map((el) => (
            <div key={el.id} className="doodle-card group rounded-2xl bg-background p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-display text-sm font-bold text-ink">
                  {el.data.author ?? "Someone"}
                  {el.data.role && <span className="ml-2 text-xs font-normal text-muted-foreground">· {el.data.role}</span>}
                </div>
                {el.created_by === user?.id && (
                  <button
                    onClick={() => removeElement(el.id)}
                    className="opacity-0 transition group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-ink/90">{el.data.text}</p>
            </div>
          ))}
          <div ref={introsEndRef} />
        </div>

        <div className="mt-3 space-y-2 border-t-2 border-dashed border-border pt-3">
          <Input
            value={roleText}
            onChange={(e) => setRoleText(e.target.value)}
            placeholder="Your role (e.g. Designer)"
            className="rounded-full"
          />
          <div className="flex gap-2">
            <Input
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void postIntro();
                }
              }}
              placeholder="Hi, I'm here to help with…"
              className="rounded-full"
            />
            <Button onClick={postIntro} className="doodle-btn rounded-full bg-primary">
              Introduce
            </Button>
          </div>
        </div>
      </section>

      {/* RIGHT — User flow */}
      <section className="doodle-card flex h-full min-h-0 flex-col rounded-3xl bg-card p-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">User flow · building in parallel</h2>
            <p className="text-xs text-muted-foreground">Sketch the journey while folks are talking</p>
          </div>
          <Button
            onClick={suggestFlow}
            disabled={suggesting}
            variant="secondary"
            className="doodle-btn rounded-full"
          >
            {suggesting ? "Sketching…" : "✨ Sketch from intros"}
          </Button>
        </header>

        <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {flow.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No steps yet. Add the first one, or let Cartoonist sketch from intros.
            </div>
          )}
          {flow.map((el, idx) => (
            <div
              key={el.id}
              className={`doodle-card group flex items-center gap-3 rounded-2xl p-3 ${
                el.source === "ai" ? "bg-secondary/40" : "bg-background"
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm text-ink">{el.data.text}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {el.source === "ai" ? "Cartoonist" : el.data.author ?? "Team"}
                </p>
              </div>
              {(el.created_by === user?.id || el.source === "ai") && (
                <button
                  onClick={() => removeElement(el.id)}
                  className="opacity-0 transition group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2 border-t-2 border-dashed border-border pt-3">
          <Input
            value={flowText}
            onChange={(e) => setFlowText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void addFlowStep();
              }
            }}
            placeholder="e.g. User lands on homepage and sees…"
            className="rounded-full"
          />
          <Button onClick={addFlowStep} className="doodle-btn rounded-full bg-primary">
            Add step
          </Button>
        </div>
      </section>
    </div>
  );
}
