import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId/lobby")({
  component: Lobby,
});

const PERSONALITY_TYPES = ["Introvert", "Extrovert", "Analytical", "Creative", "Driver", "Diplomat"];

type SessionRow = {
  id: string; name: string; type: string; mode: string; status: string;
  host_id: string; join_code: string; desired_outputs: string[];
};
type Participant = {
  user_id: string; role: string; personality_type: string | null;
  profile?: { display_name: string | null; personality_type: string | null };
};

function Lobby() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myPersonality, setMyPersonality] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Ensure I'm a participant
      await supabase
        .from("session_participants")
        .upsert({ session_id: sessionId, user_id: user.id, role: "member" }, { onConflict: "session_id,user_id", ignoreDuplicates: true });
      await loadAll();
    })();

    const ch = supabase
      .channel(`lobby:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  async function loadAll() {
    const { data: s } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!s) { toast.error("Session not found"); navigate({ to: "/dashboard" }); return; }
    setSession(s as SessionRow);
    if (s.status === "active") navigate({ to: "/sessions/$sessionId/workspace", params: { sessionId } });

    const { data: ps } = await supabase
      .from("session_participants")
      .select("user_id,role,personality_type")
      .eq("session_id", sessionId);
    const userIds = (ps ?? []).map((p) => p.user_id);
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id,display_name,personality_type").in("id", userIds)
      : { data: [] as { id: string; display_name: string | null; personality_type: string | null }[] };
    const merged: Participant[] = (ps ?? []).map((p) => ({
      ...p,
      profile: profs?.find((pr) => pr.id === p.user_id),
    }));
    setParticipants(merged);
    const mine = (ps ?? []).find((p) => p.user_id === user?.id);
    if (mine?.personality_type) setMyPersonality(mine.personality_type);
    else if (profs?.find((p) => p.id === user?.id)?.personality_type) {
      setMyPersonality(profs.find((p) => p.id === user?.id)!.personality_type!);
    }
  }

  async function setPersonality(p: string) {
    if (!user) return;
    setMyPersonality(p);
    await supabase
      .from("session_participants")
      .update({ personality_type: p })
      .eq("session_id", sessionId)
      .eq("user_id", user.id);
  }

  async function start() {
    if (!session || !user || user.id !== session.host_id) return;
    const { error } = await supabase.from("sessions").update({ status: "active" }).eq("id", sessionId);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/sessions/$sessionId/workspace", params: { sessionId } });
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-4 py-10">Loading…</main>
      </div>
    );
  }

  const isHost = user?.id === session.host_id;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="rounded-full border-2 border-ink bg-accent px-2 py-0.5 font-display text-xs">Lobby</span>
            <h1 className="mt-2 font-display text-4xl font-bold text-ink">{session.name}</h1>
            <p className="text-muted-foreground">{session.type.replace("_", " ")} · {session.mode}</p>
          </div>
          <div className="sticker-sm bg-card p-3 text-center">
            <div className="font-display text-xs text-muted-foreground">Join code</div>
            <div className="font-display text-3xl font-bold tracking-widest text-primary">{session.join_code}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="sticker p-5 md:col-span-2">
            <h2 className="font-display text-xl font-bold text-ink">Who's here</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {participants.map((p) => (
                <div key={p.user_id} className="sticker-sm flex items-center gap-3 bg-card p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display font-bold text-primary-foreground">
                    {(p.profile?.display_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-semibold text-ink">
                      {p.profile?.display_name ?? "Someone"} {p.role === "host" && <span className="ml-1 rounded-full bg-accent px-2 text-xs">host</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.personality_type ?? p.profile?.personality_type ?? "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticker p-5">
            <h2 className="font-display text-xl font-bold text-ink">Your vibe today</h2>
            <p className="text-xs text-muted-foreground">Pick what fits this session.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERSONALITY_TYPES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPersonality(p)}
                  className={`rounded-full border-2 border-ink px-3 py-1 font-display text-sm transition ${
                    myPersonality === p ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_#2B2B2B]" : "bg-card"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Mascot size={90} mood="wink" className="animate-bob" />
              <p className="text-center text-xs text-muted-foreground">Cartoonist is warming up its pen…</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          {isHost ? (
            <Button onClick={start} className="doodle-btn rounded-full bg-primary font-display text-base font-semibold">
              Start session →
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Waiting for the host to start…</p>
          )}
        </div>
      </main>
    </div>
  );
}
