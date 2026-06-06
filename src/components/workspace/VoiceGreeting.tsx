import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/Mascot";
import { useSpeechRecognition } from "@/hooks/use-speech";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Participant = { user_id: string; display_name: string | null };

type Props = {
  sessionId: string;
  participants: Participant[];
  onDone: () => void;
};

function tokenize(s: string) {
  return s.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
}

function bestMatch(spoken: string, participants: Participant[]) {
  const tokens = new Set(tokenize(spoken));
  let best: { p: Participant; score: number } | null = null;
  for (const p of participants) {
    if (!p.display_name) continue;
    const nameToks = tokenize(p.display_name);
    let score = 0;
    for (const t of nameToks) if (tokens.has(t)) score += t.length;
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= 2 ? best.p : null;
}

export function VoiceGreeting({ sessionId, participants, onDone }: Props) {
  const { user } = useAuth();
  const voice = useSpeechRecognition({ continuous: false });
  const [matched, setMatched] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStop() {
    voice.stop();
    setTimeout(async () => {
      const said = voice.finalText.trim();
      if (!said) {
        setError("I didn't hear anything — try again?");
        return;
      }
      const me = participants.find((p) => p.user_id === user?.id);
      const match = bestMatch(said, participants);
      const ok = match && (!me || match.user_id === me.user_id);
      if (!ok) {
        setError(
          match
            ? `That sounded like ${match.display_name}, but you're signed in as ${me?.display_name ?? "yourself"}. Try again.`
            : "Hmm, I couldn't catch your name. Try: \"Hi, I'm <your name>\".",
        );
        return;
      }
      setMatched(match);
      setError(null);
      await supabase.from("messages").insert({
        session_id: sessionId,
        user_id: user!.id,
        content: `👋 ${said}`,
        kind: "voice",
      });
      setTimeout(onDone, 900);
    }, 250);
  }

  if (!voice.supported) {
    // Skip greeting silently when not supported
    return (
      <div className="sticker p-5 text-center">
        <p className="text-sm text-muted-foreground">Voice greeting isn't supported in this browser — skipping.</p>
        <Button onClick={onDone} className="doodle-btn mt-3 rounded-full bg-primary">
          Enter workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="sticker p-6 text-center">
      <Mascot size={110} mood={matched ? "happy" : "thinking"} className="mx-auto animate-bob" />
      <h2 className="mt-3 font-display text-2xl font-bold text-ink">Say hi so I know it's you</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Tap the mic and say something like <span className="font-semibold text-ink">"Hi, I'm Maya."</span> I'll match your
        voice to your name and let you in.
      </p>

      <div className="mt-5 flex justify-center">
        {!voice.listening ? (
          <Button onClick={voice.start} className="doodle-btn rounded-full bg-primary px-6 py-5 text-base">
            🎙 Tap to say hello
          </Button>
        ) : (
          <Button onClick={handleStop} className="doodle-btn rounded-full bg-destructive px-6 py-5 text-base">
            ■ I'm done
          </Button>
        )}
      </div>

      {(voice.listening || voice.finalText) && (
        <div className="sticker-sm mx-auto mt-4 max-w-md bg-card p-3 text-left text-sm">
          <span className="text-xs text-muted-foreground">Heard:</span>{" "}
          <span className="text-ink">{voice.finalText || voice.interim || "…"}</span>
        </div>
      )}

      {matched && (
        <p className="mt-3 font-display text-lg text-primary">Welcome, {matched.display_name}! 🎉</p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button onClick={onDone} className="mt-4 text-xs text-muted-foreground underline">
        Skip for now
      </button>
    </div>
  );
}
