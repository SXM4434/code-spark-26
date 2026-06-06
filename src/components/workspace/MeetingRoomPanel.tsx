import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Participant = {
  user_id: string;
  display_name: string | null;
  personality_type: string | null;
  online?: boolean;
};

type Element = {
  id: string;
  type: string;
  data: { text?: string; author?: string; role?: string };
  created_at: string;
  created_by: string | null;
  source: string;
};

type Props = {
  sessionId: string;
  participants: Participant[];
  nameMap: Record<string, string>;
};

export function MeetingRoomPanel({ sessionId, participants, nameMap }: Props) {
  const { user } = useAuth();
  const [elements, setElements] = useState<Element[]>([]);
  const [introText, setIntroText] = useState("");
  const [roleText, setRoleText] = useState("");
  const [flowText, setFlowText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [autoFlow, setAutoFlow] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const introsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const flowDebounceRef = useRef<number | null>(null);
  const lastSigRef = useRef<string>("");
  const [chatBeat, setChatBeat] = useState(0);

  const sttSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  async function startListening() {
    if (!user) return;
    if (!sttSupported) {
      toast.error("Live transcription needs Chrome or Edge.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
        setRecordingUrl(URL.createObjectURL(blob));
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = async (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0].transcript.trim();
          if (res.isFinal && transcript) {
            const author = nameMap[user.id] ?? "Someone";
            await supabase.from("whiteboard_elements").insert({
              session_id: sessionId,
              type: "intro",
              data: { text: transcript, author, role: "spoken" },
              position: { x: 0, y: 0 },
              created_by: user.id,
              source: "user",
            });
          } else {
            interim += transcript + " ";
          }
        }
        setLiveText(interim.trim());
      };
      rec.onerror = (e: any) => {
        if (e.error !== "no-speech") toast.error(`Mic error: ${e.error}`);
      };
      rec.onend = () => {
        if (recognitionRef.current === rec && listening) {
          try { rec.start(); } catch { /* noop */ }
        }
      };
      rec.start();
      recognitionRef.current = rec;

      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        500,
      );
      setListening(true);
      setRecordingUrl(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't access the mic");
    }
  }

  function stopListening() {
    setListening(false);
    setLiveText("");
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function mmss(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  }


  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`room:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_elements", filter: `session_id=eq.${sessionId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        () => setChatBeat((b) => b + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    introsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [elements.length]);

  // Auto-rebuild flow as the conversation evolves
  useEffect(() => {
    if (!autoFlow) return;
    const introCount = elements.filter((e) => e.type === "intro").length;
    if (introCount === 0 && chatBeat === 0) return;
    const sig = `${introCount}:${chatBeat}`;
    if (sig === lastSigRef.current) return;
    if (flowDebounceRef.current) clearTimeout(flowDebounceRef.current);
    flowDebounceRef.current = window.setTimeout(async () => {
      lastSigRef.current = sig;
      setAutoBusy(true);
      try {
        await suggestFlow(true);
      } finally {
        setAutoBusy(false);
      }
    }, 8000);
    return () => {
      if (flowDebounceRef.current) clearTimeout(flowDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, chatBeat, autoFlow]);

  async function load() {
    const { data } = await supabase
      .from("whiteboard_elements")
      .select("id,type,data,created_at,created_by,source")
      .eq("session_id", sessionId)
      .in("type", ["intro", "flow_step"])
      .order("created_at", { ascending: true });
    setElements((data ?? []) as Element[]);
  }

  async function postIntro() {
    if (!user || !introText.trim()) return;
    const author = nameMap[user.id] ?? "Someone";
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "intro",
      data: { text: introText.trim(), author, role: roleText.trim() || null },
      position: { x: 0, y: 0 },
      created_by: user.id,
      source: "user",
    });
    setIntroText("");
    setRoleText("");
  }

  async function addFlowStep() {
    if (!user || !flowText.trim()) return;
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "flow_step",
      data: { text: flowText.trim(), author: nameMap[user.id] ?? "Someone" },
      position: { x: 0, y: 0 },
      created_by: user.id,
      source: "user",
    });
    setFlowText("");
  }

  async function removeElement(id: string) {
    await supabase.from("whiteboard_elements").delete().eq("id", id);
  }

  async function suggestFlow(silent = false) {
    if (!user) return;
    if (!silent) setSuggesting(true);
    try {
      const intros = elements.filter((e) => e.type === "intro");
      const { data: msgs } = await supabase
        .from("messages")
        .select("content,kind,user_id,created_at")
        .eq("session_id", sessionId)
        .in("kind", ["chat", "voice"])
        .order("created_at", { ascending: false })
        .limit(40);

      if (intros.length === 0 && (msgs?.length ?? 0) === 0) {
        if (!silent) toast.error("Need some conversation first.");
        return;
      }

      const introCtx = intros
        .map((i) => `${i.data.author ?? "Someone"}${i.data.role ? ` (${i.data.role})` : ""}: ${i.data.text}`)
        .join("\n");
      const chatCtx = (msgs ?? [])
        .reverse()
        .map((m) => `${nameMap[m.user_id ?? ""] ?? "Someone"}: ${m.content}`)
        .join("\n");

      const { data, error } = await supabase.functions.invoke("mediator", {
        body: {
          session_id: sessionId,
          prompt: `You are sketching a live user flow that evolves as a team talks. Based on the intros and chat, return ONLY a JSON array of 4-7 short step strings (max 8 words each) describing the user journey of what they're building. No prose.\n\nIntros:\n${introCtx}\n\nConversation:\n${chatCtx}`,
          mode: "flow",
        },
      });
      if (error) throw error;
      const raw = (data?.text ?? data?.response ?? "").toString();
      const match = raw.match(/\[[\s\S]*\]/);
      const steps: string[] = match ? JSON.parse(match[0]) : [];
      if (steps.length === 0) return;

      // Replace previous AI steps; keep user-added ones
      const { data: existingAi } = await supabase
        .from("whiteboard_elements")
        .select("id")
        .eq("session_id", sessionId)
        .eq("type", "flow_step")
        .eq("source", "ai");
      if (existingAi?.length) {
        await supabase.from("whiteboard_elements").delete().in("id", existingAi.map((r) => r.id));
      }
      for (const step of steps.slice(0, 8)) {
        await supabase.from("whiteboard_elements").insert({
          session_id: sessionId,
          type: "flow_step",
          data: { text: step, author: "Cartoonist" },
          position: { x: 0, y: 0 },
          created_by: user.id,
          source: "ai",
        });
      }
      if (!silent) toast.success(`Cartoonist sketched ${steps.length} steps`);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Couldn't sketch the flow");
    } finally {
      if (!silent) setSuggesting(false);
    }
  }


  const intros = elements.filter((e) => e.type === "intro");
  const flow = elements.filter((e) => e.type === "flow_step");

  return (
    <div className="grid h-full gap-4 lg:grid-cols-2">
      {/* LEFT — Room & intros */}
      <section className="doodle-card flex h-full min-h-0 flex-col rounded-3xl bg-card p-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" />
            <div>
              <h2 className="font-display text-lg font-bold text-ink">In the room</h2>
              <p className="text-xs text-muted-foreground">{participants.length} here · introductions captured live</p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {participants.slice(0, 6).map((p) => (
              <div
                key={p.user_id}
                title={p.display_name ?? "Someone"}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-accent font-display text-xs font-bold text-ink"
              >
                {(p.display_name ?? "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {participants.length > 6 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-semibold">
                +{participants.length - 6}
              </div>
            )}
          </div>
        </header>

        <div className="mt-3 rounded-2xl border-2 border-dashed border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${listening ? "animate-pulse bg-destructive" : "bg-muted-foreground/40"}`} />
              <span className="font-display text-sm font-semibold text-ink">
                {listening ? `Listening · ${mmss(elapsed)}` : "Listen & record"}
              </span>
            </div>
            <div className="flex gap-2">
              {!listening ? (
                <Button onClick={startListening} size="sm" className="doodle-btn rounded-full bg-primary">
                  🎙️ Start
                </Button>
              ) : (
                <Button onClick={stopListening} size="sm" variant="secondary" className="doodle-btn rounded-full">
                  ⏹ Stop
                </Button>
              )}
              {recordingUrl && !listening && (
                <a
                  href={recordingUrl}
                  download={`meeting-${new Date().toISOString().slice(0, 16)}.webm`}
                  className="doodle-btn rounded-full bg-card px-3 py-1 text-xs font-display font-semibold"
                >
                  ⬇ Recording
                </a>
              )}
            </div>
          </div>
          {listening && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              {liveText || "Waiting for someone to speak…"}
            </p>
          )}
          {!sttSupported && (
            <p className="mt-2 text-xs text-muted-foreground">
              Live transcription works best in Chrome or Edge.
            </p>
          )}
        </div>


        <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {intros.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No intros yet. Be the first to say hi 👋
            </div>
          )}
          {intros.map((el) => (
            <div key={el.id} className="doodle-card group rounded-2xl bg-background p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-display text-sm font-bold text-ink">
                  {el.data.author ?? "Someone"}
                  {el.data.role && <span className="ml-2 text-xs font-normal text-muted-foreground">· {el.data.role}</span>}
                </div>
                {el.created_by === user?.id && (
                  <button
                    onClick={() => removeElement(el.id)}
                    className="opacity-0 transition group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-ink/90">{el.data.text}</p>
            </div>
          ))}
          <div ref={introsEndRef} />
        </div>

        <div className="mt-3 space-y-2 border-t-2 border-dashed border-border pt-3">
          <Input
            value={roleText}
            onChange={(e) => setRoleText(e.target.value)}
            placeholder="Your role (e.g. Designer)"
            className="rounded-full"
          />
          <div className="flex gap-2">
            <Input
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void postIntro();
                }
              }}
              placeholder="Hi, I'm here to help with…"
              className="rounded-full"
            />
            <Button onClick={postIntro} className="doodle-btn rounded-full bg-primary">
              Introduce
            </Button>
          </div>
        </div>
      </section>

      {/* RIGHT — User flow */}
      <section className="doodle-card flex h-full min-h-0 flex-col rounded-3xl bg-card p-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">User flow · building in parallel</h2>
            <p className="text-xs text-muted-foreground">Sketch the journey while folks are talking</p>
          </div>
          <Button
            onClick={suggestFlow}
            disabled={suggesting}
            variant="secondary"
            className="doodle-btn rounded-full"
          >
            {suggesting ? "Sketching…" : "✨ Sketch from intros"}
          </Button>
        </header>

        <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {flow.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No steps yet. Add the first one, or let Cartoonist sketch from intros.
            </div>
          )}
          {flow.map((el, idx) => (
            <div
              key={el.id}
              className={`doodle-card group flex items-center gap-3 rounded-2xl p-3 ${
                el.source === "ai" ? "bg-secondary/40" : "bg-background"
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm text-ink">{el.data.text}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {el.source === "ai" ? "Cartoonist" : el.data.author ?? "Team"}
                </p>
              </div>
              {(el.created_by === user?.id || el.source === "ai") && (
                <button
                  onClick={() => removeElement(el.id)}
                  className="opacity-0 transition group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2 border-t-2 border-dashed border-border pt-3">
          <Input
            value={flowText}
            onChange={(e) => setFlowText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void addFlowStep();
              }
            }}
            placeholder="e.g. User lands on homepage and sees…"
            className="rounded-full"
          />
          <Button onClick={addFlowStep} className="doodle-btn rounded-full bg-primary">
            Add step
          </Button>
        </div>
      </section>
    </div>
  );
}
