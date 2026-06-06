import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId/wrap")({
  component: WrapPage,
});

type Artifact = {
  id: string;
  kind: string;
  content: { title?: string; body?: string };
  updated_at: string;
};

type Participant = {
  user_id: string;
  personality_type: string | null;
  display_name: string | null;
};

const KIND_META: Record<string, { emoji: string; color: string }> = {
  summary: { emoji: "📝", color: "bg-accent/40" },
  prd: { emoji: "📋", color: "bg-secondary/40" },
  user_journey: { emoji: "🧭", color: "bg-highlight/40" },
  flow: { emoji: "🔀", color: "bg-accent/40" },
  timeline: { emoji: "📅", color: "bg-secondary/40" },
  problem_statement: { emoji: "🎯", color: "bg-highlight/40" },
  decisions: { emoji: "✅", color: "bg-accent/40" },
  action_items: { emoji: "🚀", color: "bg-secondary/40" },
  team_alignment: { emoji: "🤝", color: "bg-highlight/40" },
};

function WrapPage() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const [session, setSession] = useState<{ id: string; name: string } | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`wrap:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_artifacts", filter: `session_id=eq.${sessionId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  async function load() {
    const { data: s } = await supabase.from("sessions").select("id,name").eq("id", sessionId).maybeSingle();
    if (s) setSession(s);
    const { data: arts } = await supabase
      .from("generated_artifacts")
      .select("id,kind,content,updated_at")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false });
    setArtifacts(((arts as unknown) as Artifact[]) ?? []);
    const { data: ps } = await supabase
      .from("session_participants")
      .select("user_id,personality_type")
      .eq("session_id", sessionId);
    const ids = (ps ?? []).map((p) => p.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,display_name").in("id", ids)
      : { data: [] as { id: string; display_name: string | null }[] };
    setParticipants(
      (ps ?? []).map((p) => ({
        user_id: p.user_id,
        personality_type: p.personality_type,
        display_name: profs?.find((pr) => pr.id === p.user_id)?.display_name ?? null,
      })),
    );
  }

  async function saveEdit(a: Artifact) {
    const newContent = { ...a.content, body: draft };
    const { error } = await supabase.from("generated_artifacts").update({ content: newContent }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success("Saved");
  }

  function download(a: Artifact) {
    const blob = new Blob([a.content.body ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${a.kind}.md`; link.click();
    URL.revokeObjectURL(url);
  }

  async function copy(a: Artifact) {
    await navigator.clipboard.writeText(a.content.body ?? "");
    toast.success("Copied markdown");
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-docs", {
        body: { session_id: sessionId },
      });
      if (error) {
        const msg = (error as { context?: { error?: string } })?.context?.error ?? error.message;
        toast.error(msg ?? "Regeneration failed");
      } else {
        toast.success("Redrawn!");
      }
    } finally {
      setRegenerating(false);
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-10">Loading wrap-up…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mascot size={64} mood="happy" />
            <div>
              <span className="rounded-full border-2 border-ink bg-accent px-3 py-1 font-display text-xs">wrap-up</span>
              <h1 className="mt-2 font-display text-4xl font-bold text-ink">{session.name}</h1>
              <p className="text-sm text-muted-foreground">Everything Cartoonist drew up from the conversation.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={regenerate} disabled={regenerating} variant="secondary" className="doodle-btn rounded-full">
              {regenerating ? "Redrawing…" : "🔄 Redraw all"}
            </Button>
            <Link
              to="/sessions/$sessionId/workspace"
              params={{ sessionId }}
              className="doodle-btn rounded-full bg-card px-4 py-2 font-display text-sm font-semibold"
            >
              Back to room
            </Link>
          </div>
        </div>

        {artifacts.length === 0 && (
          <div className="sticker mt-8 flex flex-col items-center gap-3 p-10 text-center">
            <Mascot size={120} mood="wave" className="animate-bob" />
            <h2 className="font-display text-2xl font-bold text-ink">Nothing drawn up yet</h2>
            <p className="max-w-md text-muted-foreground">Head back to the room and hit "Generate docs" once you've had some conversation.</p>
          </div>
        )}

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          {artifacts.map((a) => {
            const meta = KIND_META[a.kind] ?? { emoji: "📄", color: "bg-card" };
            const isEditing = editingId === a.id;
            return (
              <article key={a.id} className={`sticker p-5 ${meta.color}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-ink">
                    <span className="mr-2">{meta.emoji}</span>
                    {a.content.title ?? a.kind}
                  </h3>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copy(a)} title="Copy">📋</Button>
                    <Button size="sm" variant="ghost" onClick={() => download(a)} title="Download">⬇️</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (isEditing) saveEdit(a);
                        else { setEditingId(a.id); setDraft(a.content.body ?? ""); }
                      }}
                      title={isEditing ? "Save" : "Edit"}
                    >
                      {isEditing ? "💾" : "✏️"}
                    </Button>
                  </div>
                </div>
                {isEditing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={14}
                    className="mt-3 w-full rounded-xl border-2 border-ink/30 bg-background p-3 font-mono text-xs outline-none"
                  />
                ) : (
                  <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-ink/90">
                    {a.content.body ?? "(empty)"}
                  </pre>
                )}
              </article>
            );
          })}
        </section>

        {participants.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-ink">Team alignment</h2>
            <p className="text-sm text-muted-foreground">Strengths the team brought to the room.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {participants.map((p) => (
                <div key={p.user_id} className="sticker-sm bg-card p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display font-bold text-primary-foreground">
                      {(p.display_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-display font-semibold text-ink">{p.display_name ?? "Someone"}</div>
                      <div className="text-[11px] text-muted-foreground">{p.personality_type ?? "—"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
