import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const PERSONALITY_TYPES = [
  { id: "Introvert", emoji: "🌙", desc: "Recharges in quiet" },
  { id: "Extrovert", emoji: "✨", desc: "Energized by people" },
  { id: "Analytical", emoji: "🔬", desc: "Loves data & systems" },
  { id: "Creative", emoji: "🎨", desc: "Big-picture & visual" },
  { id: "Driver", emoji: "🚀", desc: "Action-oriented, decisive" },
  { id: "Diplomat", emoji: "🤝", desc: "Bridges, listens, mediates" },
];

const STRENGTHS = [
  "Strategy", "Research", "Design", "Engineering", "Writing", "Facilitation",
  "Marketing", "Sales", "Operations", "Data", "Product", "Storytelling",
];

function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [personality, setPersonality] = useState<string>("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name ?? "");
        setPersonality(data.personality_type ?? "");
        setStrengths(data.strengths ?? []);
        setBio(data.bio ?? "");
        if (data.onboarded) navigate({ to: "/dashboard" });
      }
    });
  }, [user, navigate]);

  function toggleStrength(s: string) {
    setStrengths((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function save() {
    if (!user) return;
    if (!displayName.trim() || !personality) {
      toast.error("Pick a name and a personality first");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim(),
      personality_type: personality,
      strengths,
      bio: bio.trim() || null,
      onboarded: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-4">
          <Mascot size={80} mood="happy" className="animate-bob" />
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">Let's draw your profile</h1>
            <p className="text-sm text-muted-foreground">So Cartoonist can mediate around your style.</p>
          </div>
        </div>

        <div className="sticker mt-6 space-y-6 p-6">
          <div>
            <Label htmlFor="name" className="font-display text-base">Display name</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 rounded-xl border-2 border-ink" />
          </div>

          <div>
            <Label className="font-display text-base">Your vibe</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PERSONALITY_TYPES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonality(p.id)}
                  className={`sticker-sm flex flex-col items-start p-3 text-left transition ${
                    personality === p.id ? "bg-primary text-primary-foreground" : "bg-card"
                  }`}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="mt-1 font-display font-semibold">{p.id}</span>
                  <span className="text-xs opacity-80">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="font-display text-base">Strengths (pick a few)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {STRENGTHS.map((s) => {
                const on = strengths.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStrength(s)}
                    className={`rounded-full border-2 border-ink px-3 py-1 font-display text-sm transition ${
                      on ? "bg-accent text-ink shadow-[2px_2px_0_0_#2B2B2B]" : "bg-card hover:bg-accent/40"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="bio" className="font-display text-base">One-line bio (optional)</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} className="mt-1 rounded-xl border-2 border-ink" />
          </div>

          <Button disabled={busy} onClick={save} className="doodle-btn w-full rounded-full bg-primary font-display text-base font-semibold">
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
