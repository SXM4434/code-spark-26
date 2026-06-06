import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/sessions/new")({
  component: NewSession,
});

const TYPES = [
  { id: "hackathon", label: "Hackathon", emoji: "🏆" },
  { id: "team_meeting", label: "Team meeting", emoji: "🗓️" },
  { id: "collaboration", label: "Collaboration", emoji: "🤝" },
  { id: "brainstorm", label: "Brainstorm", emoji: "💡" },
] as const;

const MODES = [
  { id: "chat", label: "Chat only", emoji: "💬" },
  { id: "audio", label: "Audio only", emoji: "🎙️" },
  { id: "both", label: "Audio + chat", emoji: "✨" },
] as const;

const OUTPUTS = [
  { id: "summary", label: "Summary" },
  { id: "prd", label: "PRD" },
  { id: "user_journey", label: "User journey" },
  { id: "product_flow", label: "Product flow" },
  { id: "timeline", label: "Timeline" },
  { id: "problem_statement", label: "Problem statement" },
  { id: "action_items", label: "Action items" },
];

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function NewSession() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("brainstorm");
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("both");
  const [outputs, setOutputs] = useState<string[]>(["summary", "action_items"]);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setOutputs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function create() {
    if (!user) return;
    if (!name.trim()) { toast.error("Give it a name"); return; }
    setBusy(true);
    try {
      const join_code = randomCode();
      const { data, error } = await supabase
        .from("sessions")
        .insert({ name: name.trim(), type, mode, desired_outputs: outputs, host_id: user.id, join_code })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("session_participants").upsert(
        { session_id: data.id, user_id: user.id, role: "host" },
        { onConflict: "session_id,user_id" },
      );
      navigate({ to: "/sessions/$sessionId/lobby", params: { sessionId: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-ink">New session</h1>
        <p className="text-muted-foreground">Three quick choices and you're in.</p>

        <div className="sticker mt-6 space-y-6 p-6">
          <div>
            <Label htmlFor="name" className="font-display text-base">Session name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 planning, Hackathon kickoff…" className="mt-1 rounded-xl border-2 border-ink" />
          </div>

          <div>
            <Label className="font-display text-base">Type</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => setType(t.id)}
                  className={`sticker-sm p-3 text-left transition ${type === t.id ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <div className="text-2xl">{t.emoji}</div>
                  <div className="mt-1 font-display font-semibold">{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="font-display text-base">Mode</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={`sticker-sm p-3 text-left transition ${mode === m.id ? "bg-secondary text-secondary-foreground" : "bg-card"}`}>
                  <div className="text-2xl">{m.emoji}</div>
                  <div className="mt-1 font-display font-semibold">{m.label}</div>
                </button>
              ))}
            </div>
            {(mode === "audio" || mode === "both") && (
              <p className="mt-2 text-xs text-muted-foreground">Voice transcription works best in Chrome / Edge.</p>
            )}
          </div>

          <div>
            <Label className="font-display text-base">Desired outputs</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {OUTPUTS.map((o) => {
                const on = outputs.includes(o.id);
                return (
                  <button key={o.id} type="button" onClick={() => toggle(o.id)}
                    className={`rounded-full border-2 border-ink px-3 py-1 font-display text-sm transition ${
                      on ? "bg-accent text-ink shadow-[2px_2px_0_0_#2B2B2B]" : "bg-card hover:bg-accent/40"
                    }`}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button disabled={busy} onClick={create} className="doodle-btn w-full rounded-full bg-primary font-display text-base font-semibold">
            {busy ? "Creating…" : "Create session"}
          </Button>
        </div>
      </main>
    </div>
  );
}
