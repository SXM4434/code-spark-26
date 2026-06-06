import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const voice = useSpeechRecognition({ continuous: true });
  const [draft, setDraft] = useState("");
  const [matched, setMatched] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep draft in sync with what's being heard
  useEffect(() => {
    if (voice.listening) {
      const live = (voice.finalText + (voice.interim ? " " + voice.interim : "")).trim();
      if (live) setDraft(live);
    }
  }, [voice.finalText, voice.interim, voice.listening]);

  function handleStop() {
    voice.stop();
    setTimeout(() => {
      const said = voice.finalText.trim();
      if (said) setDraft(said);
    }, 250);
  }

  async function confirmAndEnter() {
    const said = draft.trim();
    if (!said) {
      setError("Type or say something so I know who you are.");
      return;
    }
    const me = participants.find((p) => p.user_id === user?.id);
    const match = bestMatch(said, participants);
    const ok = match && (!me || match.user_id === me.user_id);
    if (!ok) {
      setError(
        match
          ? `That sounded like ${match.display_name}, but you're signed in as ${me?.display_name ?? "yourself"}. Fix the text and try again.`
          : "I couldn't find your name in that. Try: \"Hi, I'm <your name> — and here's what I want to work on…\"",
      );
      return;
    }
    setError(null);
    setMatched(match);
    setSubmitting(true);
    // Save the greeting
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user!.id,
      content: `👋 ${said}`,
      kind: "voice",
    });
    // If they said more than just their name, save it as an opening "instructions" note
    const nameToks = new Set(tokenize(match.display_name ?? ""));
    const extra = tokenize(said).filter((t) => !nameToks.has(t) && !["hi", "hey", "hello", "im", "i", "am", "this", "is"].includes(t));
    if (extra.length >= 3) {
      await supabase.from("messages").insert({
        session_id: sessionId,
        user_id: user!.id,
        content: said,
        kind: "system",
      });
    }
    setTimeout(onDone, 700);
  }

  if (!voice.supported) {
    return (
      <div className="sticker p-5 text-center">
        <p className="text-sm text-muted-foreground">Voice greeting isn't supported in this browser.</p>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type: Hi, I'm <your name>"
          className="mt-3"
        />
        <Button onClick={confirmAndEnter} className="doodle-btn mt-3 rounded-full bg-primary">
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
        Tap the mic and say <span className="font-semibold text-ink">"Hi, I'm Maya — and today I want to…"</span>.
        I'll capture it, you can fix any typos, then jump in.
      </p>

      <div className="mt-5 flex justify-center gap-2">
        {!voice.listening ? (
          <Button onClick={() => { setError(null); voice.reset(); voice.start(); }} className="doodle-btn rounded-full bg-primary px-6 py-5 text-base">
            🎙 Tap to speak
          </Button>
        ) : (
          <Button onClick={handleStop} className="doodle-btn rounded-full bg-destructive px-6 py-5 text-base">
            ■ Done speaking
          </Button>
        )}
      </div>

      {(voice.listening || draft) && (
        <div className="mx-auto mt-4 max-w-md text-left">
          <label className="text-xs text-muted-foreground">
            {voice.listening ? "Listening — edit after you stop:" : "Heard (edit if anything's wrong):"}
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            disabled={voice.listening}
            className="sticker-sm mt-1 w-full bg-card p-3 text-sm outline-none disabled:opacity-70"
            placeholder="Hi, I'm…"
          />
        </div>
      )}

      {matched && (
        <p className="mt-3 font-display text-lg text-primary">Welcome, {matched.display_name}! 🎉</p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!voice.listening && draft && !matched && (
        <Button
          onClick={confirmAndEnter}
          disabled={submitting}
          className="doodle-btn mt-4 rounded-full bg-primary px-6 py-5 text-base"
        >
          ✓ Looks right — let me in
        </Button>
      )}

      <div className="mt-4">
        <button onClick={onDone} className="text-xs text-muted-foreground underline">
          Skip for now
        </button>
      </div>
    </div>
  );
}
