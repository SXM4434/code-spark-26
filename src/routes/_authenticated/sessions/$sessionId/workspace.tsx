import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Mascot } from "@/components/Mascot";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { NotesPanel } from "@/components/workspace/NotesPanel";
import { ParticipantsList } from "@/components/workspace/ParticipantsList";
import { VoiceGreeting } from "@/components/workspace/VoiceGreeting";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId/workspace")({
  component: Workspace,
});

type Session = { id: string; name: string; type: string; mode: string; status: string; host_id: string };
type Participant = {
  user_id: string;
  display_name: string | null;
  personality_type: string | null;
  online?: boolean;
};

const DEMO_LINES = [
  "I think the onboarding flow is what's blocking new users — it feels long.",
  "Agree, but maybe we should also look at our pricing page bounce rate?",
  "What if we tried a 'try it without signing up' button on the landing page?",
  "Love that. Lower friction. We could measure conversion in a week.",
];

function Workspace() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [greeted, setGreeted] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`ws:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  async function load() {
    const { data: s } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle();
    if (s) setSession(s as Session);
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
        online: true,
      })),
    );
  }

  async function startDemo() {
    if (!session || !user) return;
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user.id,
      content: "Demo mode kicked off — let's brainstorm side by side.",
      kind: "system",
    });
    for (let i = 0; i < DEMO_LINES.length; i++) {
      const line = DEMO_LINES[i];
      await new Promise((r) => setTimeout(r, 700));
      await supabase.from("messages").insert({
        session_id: sessionId,
        user_id: user.id,
        content: line,
        kind: "chat",
      });
    }
    await new Promise((r) => setTimeout(r, 500));
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user.id,
      content:
        "I'm noticing two threads: onboarding friction and pricing-page bounce. Want me to put both on the board so we can pick one?",
      kind: "ai_mediator",
    });
  }

  const nameMap = Object.fromEntries(participants.map((p) => [p.user_id, p.display_name ?? "Someone"]));

  if (!session || !user) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-10">Loading workspace…</main>
      </div>
    );
  }

  if (!greeted) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <VoiceGreeting sessionId={sessionId} participants={participants} onDone={() => setGreeted(true)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mascot size={56} mood="happy" />
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">{session.name}</h1>
              <p className="text-xs text-muted-foreground">
                {session.type.replace("_", " ")} · live workspace
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={startDemo} variant="secondary" className="doodle-btn rounded-full">
              ✨ Play demo conversation
            </Button>
            <Link
              to="/dashboard"
              className="doodle-btn rounded-full bg-card px-4 py-2 font-display text-sm font-semibold"
            >
              Leave
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr_320px]">
          <ParticipantsList participants={participants} />
          <div className="h-[70vh]">
            <ChatPanel sessionId={sessionId} nameMap={nameMap} />
          </div>
          <div className="h-[70vh]">
            <NotesPanel sessionId={sessionId} />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Phase 3 coming up: the live whiteboard and the AI mediator nudging in real time.
        </p>
      </main>
    </div>
  );
}
