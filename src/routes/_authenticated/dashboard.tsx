import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mascot } from "@/components/Mascot";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type SessionRow = {
  id: string;
  name: string;
  type: string;
  mode: string;
  status: string;
  join_code: string;
  created_at: string;
};

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", user.id).maybeSingle();
      if (!profile?.onboarded) { navigate({ to: "/onboarding" }); return; }
      const { data } = await supabase
        .from("sessions")
        .select("id,name,type,mode,status,join_code,created_at")
        .order("created_at", { ascending: false });
      setSessions((data ?? []) as SessionRow[]);
      setLoaded(true);
    })();
  }, [user, navigate]);

  async function joinByCode() {
    if (!code.trim() || !user) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc("find_session_by_code", { _code: code.trim() });
      if (error) throw error;
      const session = Array.isArray(data) ? data[0] : data;
      if (!session) { toast.error("No session with that code"); return; }
      const { error: joinErr } = await supabase
        .from("session_participants")
        .upsert({ session_id: session.id, user_id: user.id, role: "member" }, { onConflict: "session_id,user_id" });
      if (joinErr) throw joinErr;
      navigate({ to: "/sessions/$sessionId/lobby", params: { sessionId: session.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-ink">Your studio</h1>
            <p className="text-muted-foreground">Start a session or hop into one.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="sticker-sm flex items-center gap-2 bg-card p-1 pl-3">
              <Input
                placeholder="Join code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-32 border-0 bg-transparent font-display uppercase tracking-widest focus-visible:ring-0"
                maxLength={8}
              />
              <Button onClick={joinByCode} disabled={joining} size="sm" className="doodle-btn rounded-full bg-secondary font-display text-secondary-foreground">
                Join
              </Button>
            </div>
            <Link to="/sessions/new">
              <Button className="doodle-btn rounded-full bg-primary font-display text-base font-semibold">
                + Start session
              </Button>
            </Link>
          </div>
        </div>

        <section className="mt-8">
          {!loaded ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : sessions.length === 0 ? (
            <div className="sticker flex flex-col items-center gap-3 p-10 text-center">
              <Mascot size={140} mood="wave" className="animate-bob" />
              <h2 className="font-display text-2xl font-bold text-ink">No sessions yet</h2>
              <p className="max-w-md text-muted-foreground">Let's draw up your first one — Cartoonist will meet you there.</p>
              <Link to="/sessions/new">
                <Button className="doodle-btn rounded-full bg-primary font-display">Start a session</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  to="/sessions/$sessionId/lobby"
                  params={{ sessionId: s.id }}
                  className="sticker block bg-card p-5 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-display text-xl font-bold text-ink">{s.name}</h3>
                    <span className="rounded-full border-2 border-ink bg-accent px-2 py-0.5 font-display text-xs">{s.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.type.replace("_", " ")} · {s.mode}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-display text-xs text-muted-foreground">code</span>
                    <span className="font-display text-lg font-bold tracking-widest text-primary">{s.join_code}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
