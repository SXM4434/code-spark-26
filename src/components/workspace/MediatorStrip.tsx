import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/Mascot";
import { toast } from "sonner";

type Msg = { id: string; content: string; created_at: string };

export function MediatorStrip({ sessionId }: { sessionId: string }) {
  const [latest, setLatest] = useState<Msg | null>(null);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,content,created_at")
        .eq("session_id", sessionId)
        .eq("kind", "ai_mediator")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data[0]) setLatest(data[0] as Msg);
    })();
    const ch = supabase
      .channel(`ai-strip:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as { id: string; content: string; kind: string; created_at: string };
          if (m.kind === "ai_mediator") setLatest({ id: m.id, content: m.content, created_at: m.created_at });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  async function askCartoonist() {
    setThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mediator", { body: { session_id: sessionId } });
      if (error) {
        const msg = (error as { context?: { error?: string } })?.context?.error ?? error.message;
        toast.error(msg ?? "Cartoonist couldn't respond");
      } else if (data?.skipped) {
        toast.info("Say a few things first — Cartoonist needs something to listen to.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to call mediator");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="sticker flex items-center gap-3 bg-accent/40 p-3">
      <Mascot size={48} mood={thinking ? "wave" : "happy"} className={thinking ? "animate-bob" : ""} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-xs font-bold uppercase tracking-wider text-primary">Cartoonist says</div>
        <div className="truncate text-sm text-ink">
          {thinking ? "thinking…" : latest?.content ?? "I'll chime in when there's something worth surfacing. Or tap →"}
        </div>
      </div>
      <Button onClick={askCartoonist} disabled={thinking} className="doodle-btn rounded-full bg-primary">
        ✨ Ask Cartoonist
      </Button>
    </div>
  );
}
