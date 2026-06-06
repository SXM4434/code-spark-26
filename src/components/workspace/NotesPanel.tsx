import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type Note = { id: string; content: string; created_at: string };

export function NotesPanel({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,content,created_at")
        .eq("session_id", sessionId)
        .eq("kind", "anon_note")
        .order("created_at", { ascending: false });
      setNotes((data as Note[]) ?? []);
    })();

    const ch = supabase
      .channel(`notes:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as { id: string; content: string; kind: string; created_at: string };
          if (m.kind === "anon_note") {
            setNotes((prev) => [{ id: m.id, content: m.content, created_at: m.created_at }, ...prev]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const t = text.trim();
    setText("");
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user.id,
      content: t,
      kind: "anon_note",
      is_anonymous: true,
    });
  }

  return (
    <div className="sticker flex h-full flex-col bg-secondary/30 p-4">
      <h3 className="font-display text-lg font-bold text-ink">Anonymous notes</h3>
      <p className="text-xs text-muted-foreground">
        Got a thought you don't want to say out loud? Drop it here — nobody sees who sent it.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Whisper an idea…"
          className="sticker-sm flex-1 bg-card px-3 py-2 text-sm outline-none"
        />
        <Button type="submit" className="doodle-btn rounded-full bg-accent text-accent-foreground">
          Drop
        </Button>
      </form>
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {notes.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="sticker-sm bg-card p-3 text-sm">
            <span className="mr-1">💭</span> {n.content}
          </div>
        ))}
      </div>
    </div>
  );
}
