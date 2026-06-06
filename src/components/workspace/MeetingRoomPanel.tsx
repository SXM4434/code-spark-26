import { useEffect, useMemo, useRef, useState } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Participant = {
  user_id: string;
  display_name: string | null;
  personality_type: string | null;
  online?: boolean;
};

type WBElement = {
  id: string;
  type: string;
  data: { text?: string; author?: string; role?: string };
  position: { x?: number; y?: number } | null;
  created_at: string;
  created_by: string | null;
  source: string;
};

type Msg = {
  id: string;
  user_id: string | null;
  content: string;
  kind: string;
  created_at: string;
  is_anonymous?: boolean;
};

type PollOption = { id: string; label: string };
type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
};
type Vote = { poll_id: string; user_id: string; option_id: string };

type FeedItem = {
  id: string;
  ts: string;
  author: string;
  body: string;
  tag: "intro" | "spoken" | "chat" | "voice" | "mediator" | "system" | "whisper" | "poll";
  mine: boolean;
  poll?: Poll;
};

type Props = {
  sessionId: string;
  participants: Participant[];
  nameMap: Record<string, string>;
};

const TAG_STYLES: Record<FeedItem["tag"], string> = {
  intro: "bg-foreground/5 text-foreground border-foreground/10",
  spoken: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  chat: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  voice: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  mediator: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  system: "bg-muted text-muted-foreground border-border",
  whisper: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  poll: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
};

const TAG_LABELS: Record<FeedItem["tag"], string> = {
  intro: "intro",
  spoken: "spoken",
  chat: "chat",
  voice: "voice",
  mediator: "mediator",
  system: "system",
  whisper: "whisper",
  poll: "poll",
};

// Canvas sizing — generous virtual surface
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const NODE_W = 200;
const NODE_H = 84;

export function MeetingRoomPanel({ sessionId, participants, nameMap }: Props) {
  const { user } = useAuth();
  const [elements, setElements] = useState<WBElement[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [composer, setComposer] = useState("");
  const [composerMode, setComposerMode] = useState<"chat" | "intro" | "whisper" | "poll">("chat");
  const [roleText, setRoleText] = useState("");
  const [pollOptionsText, setPollOptionsText] = useState("Yes\nNo");
  const [flowText, setFlowText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [autoFlow, setAutoFlow] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const flowDebounceRef = useRef<number | null>(null);
  const lastSigRef = useRef<string>("");

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // ---------- ElevenLabs Scribe ----------
  const persistSpoken = async (text: string) => {
    const uid = userIdRef.current;
    if (!uid || !text.trim()) return;
    const author = nameMap[uid] ?? "Someone";
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "intro",
      data: { text: text.trim(), author, role: "spoken" },
      position: { x: 0, y: 0 },
      created_by: uid,
      source: "user",
    });
  };

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data: { text: string }) => setLiveText(data.text ?? ""),
    onCommittedTranscript: async (data: { text: string }) => {
      setLiveText("");
      await persistSpoken(data.text ?? "");
    },
  });

  async function startListening() {
    if (!user) return;
    try {
      const tokenRes = await fetch("/api/elevenlabs/scribe-token", { method: "POST" });
      if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status}`);
      const { token } = await tokenRes.json();
      if (!token) throw new Error("No token received");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.start(1000);
      recorderRef.current = recorder;

      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });

      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        500,
      );
      setListening(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start transcription");
      stopListening();
    }
  }

  function stopListening() {
    setListening(false);
    setLiveText("");
    try { scribe.disconnect(); } catch { /* noop */ }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => {
    return () => {
      try { scribe.disconnect(); } catch { /* noop */ }
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mmss(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  }

  // ---------- Data load + realtime ----------
  async function loadElements() {
    const { data } = await supabase
      .from("whiteboard_elements")
      .select("id,type,data,position,created_at,created_by,source")
      .eq("session_id", sessionId)
      .in("type", ["intro", "flow_step"])
      .order("created_at", { ascending: true });
    setElements((data ?? []) as WBElement[]);
  }

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("id,user_id,content,kind,created_at,is_anonymous")
      .eq("session_id", sessionId)
      .in("kind", ["chat", "voice", "ai_mediator", "system", "anon_note"])
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
  }

  async function loadPolls() {
    const { data } = await supabase
      .from("polls")
      .select("id,question,options,status,created_by,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    const ps = ((data ?? []) as unknown) as Poll[];
    setPolls(ps);
    if (ps.length) {
      const { data: vs } = await supabase
        .from("vote_responses")
        .select("poll_id,user_id,option_id")
        .in("poll_id", ps.map((p) => p.id));
      setVotes((vs ?? []) as Vote[]);
    } else {
      setVotes([]);
    }
  }

  useEffect(() => {
    void loadElements();
    void loadMessages();
    void loadPolls();
    const ch = supabase
      .channel(`room:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_elements", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "UPDATE" && payload.new) {
            const next = payload.new as WBElement;
            setElements((prev) => prev.map((el) => (el.id === next.id ? { ...el, ...next } : el)));
          } else {
            void loadElements();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as Msg;
          if (["chat", "voice", "ai_mediator", "system", "anon_note"].includes(m.kind)) {
            setMessages((prev) => [...prev, m]);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "polls", filter: `session_id=eq.${sessionId}` },
        () => void loadPolls(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vote_responses" },
        () => void loadPolls(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function votePoll(pollId: string, optionId: string) {
    if (!user) return;
    const existing = votes.find((v) => v.poll_id === pollId && v.user_id === user.id);
    if (existing) {
      await supabase.from("vote_responses").update({ option_id: optionId }).eq("poll_id", pollId).eq("user_id", user.id);
    } else {
      await supabase.from("vote_responses").insert({ poll_id: pollId, user_id: user.id, option_id: optionId });
    }
    await loadPolls();
  }

  async function closePoll(p: Poll) {
    await supabase.from("polls").update({ status: "closed" }).eq("id", p.id);
  }

  // ---------- Unified feed ----------
  const feed: FeedItem[] = useMemo(() => {
    const intros: FeedItem[] = elements
      .filter((e) => e.type === "intro")
      .map((e) => {
        const isSpoken = e.data.role === "spoken";
        return {
          id: `e-${e.id}`,
          ts: e.created_at,
          author: e.data.author ?? "Someone",
          body: e.data.text ?? "",
          tag: isSpoken ? "spoken" : "intro",
          mine: e.created_by === user?.id,
        };
      });

    const msgs: FeedItem[] = messages.map((m) => {
      const tag: FeedItem["tag"] =
        m.kind === "ai_mediator" ? "mediator" :
        m.kind === "system" ? "system" :
        m.kind === "voice" ? "voice" :
        m.kind === "anon_note" ? "whisper" : "chat";
      const author =
        tag === "mediator" ? "Mediator" :
        tag === "system" ? "system" :
        tag === "whisper" ? "Anonymous" :
        nameMap[m.user_id ?? ""] ?? "Someone";
      return {
        id: `m-${m.id}`,
        ts: m.created_at,
        author,
        body: m.content,
        tag,
        mine: tag === "whisper" ? false : m.user_id === user?.id,
      };
    });

    const pollItems: FeedItem[] = polls.map((p) => ({
      id: `p-${p.id}`,
      ts: p.created_at,
      author: nameMap[p.created_by ?? ""] ?? "Someone",
      body: p.question,
      tag: "poll",
      mine: p.created_by === user?.id,
      poll: p,
    }));

    return [...intros, ...msgs, ...pollItems].sort((a, b) => a.ts.localeCompare(b.ts));
  }, [elements, messages, polls, nameMap, user?.id]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.length]);

  // ---------- Auto flow ----------
  useEffect(() => {
    if (!autoFlow) return;
    const introCount = feed.filter((f) => f.tag === "intro" || f.tag === "spoken").length;
    const chatCount = feed.filter((f) => f.tag === "chat" || f.tag === "voice").length;
    if (introCount + chatCount === 0) return;
    const sig = `${introCount}:${chatCount}`;
    if (sig === lastSigRef.current) return;
    if (flowDebounceRef.current) clearTimeout(flowDebounceRef.current);
    flowDebounceRef.current = window.setTimeout(async () => {
      lastSigRef.current = sig;
      setAutoBusy(true);
      try { await suggestFlow(true); } finally { setAutoBusy(false); }
    }, 800);
    return () => { if (flowDebounceRef.current) clearTimeout(flowDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, autoFlow]);

  // ---------- Actions ----------
  async function sendComposer() {
    if (!user || !composer.trim()) return;
    const body = composer.trim();
    setComposer("");
    if (composerMode === "intro") {
      await supabase.from("whiteboard_elements").insert({
        session_id: sessionId,
        type: "intro",
        data: { text: body, author: nameMap[user.id] ?? "Someone", role: roleText.trim() || null },
        position: { x: 0, y: 0 },
        created_by: user.id,
        source: "user",
      });
      setRoleText("");
    } else {
      await supabase.from("messages").insert({
        session_id: sessionId,
        user_id: user.id,
        content: body,
        kind: "chat",
      });
    }
  }

  function defaultPositionFor(idx: number) {
    const cols = 4;
    const gx = 60, gy = 60, sx = 260, sy = 140;
    return { x: gx + (idx % cols) * sx, y: gy + Math.floor(idx / cols) * sy };
  }

  async function addFlowStep() {
    if (!user || !flowText.trim()) return;
    const flowCount = elements.filter((e) => e.type === "flow_step").length;
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "flow_step",
      data: { text: flowText.trim(), author: nameMap[user.id] ?? "Someone" },
      position: defaultPositionFor(flowCount),
      created_by: user.id,
      source: "user",
    });
    setFlowText("");
  }

  async function removeElement(id: string) {
    await supabase.from("whiteboard_elements").delete().eq("id", id);
  }

  async function updateNodePosition(id: string, pos: { x: number; y: number }) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, position: pos } : el)));
    await supabase.from("whiteboard_elements").update({ position: pos }).eq("id", id);
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

      const { data: existingAi } = await supabase
        .from("whiteboard_elements")
        .select("id")
        .eq("session_id", sessionId)
        .eq("type", "flow_step")
        .eq("source", "ai");
      if (existingAi?.length) {
        await supabase.from("whiteboard_elements").delete().in("id", existingAi.map((r) => r.id));
      }
      const existingUserFlow = elements.filter((e) => e.type === "flow_step" && e.source !== "ai").length;
      for (let i = 0; i < Math.min(steps.length, 8); i++) {
        await supabase.from("whiteboard_elements").insert({
          session_id: sessionId,
          type: "flow_step",
          data: { text: steps[i], author: "Mediator" },
          position: defaultPositionFor(existingUserFlow + i),
          created_by: user.id,
          source: "ai",
        });
      }
      if (!silent) toast.success(`Sketched ${steps.length} steps`);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Couldn't sketch the flow");
    } finally {
      if (!silent) setSuggesting(false);
    }
  }

  const flow = elements.filter((e) => e.type === "flow_step");

  // ---------- Canvas drag ----------
  function NodeCard({ el, idx }: { el: WBElement; idx: number }) {
    const fallback = defaultPositionFor(idx);
    const x = el.position?.x ?? fallback.x;
    const y = el.position?.y ?? fallback.y;
    const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const cur = dragPos ?? { x, y };

    function onPointerDown(e: React.PointerEvent) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragOffset.current = { dx: e.clientX - cur.x, dy: e.clientY - cur.y };
      setDragPos(cur);
    }
    function onPointerMove(e: React.PointerEvent) {
      if (!dragOffset.current) return;
      const nx = Math.max(0, Math.min(CANVAS_W - NODE_W, e.clientX - dragOffset.current.dx));
      const ny = Math.max(0, Math.min(CANVAS_H - NODE_H, e.clientY - dragOffset.current.dy));
      setDragPos({ x: nx, y: ny });
    }
    function onPointerUp() {
      if (dragPos) void updateNodePosition(el.id, dragPos);
      dragOffset.current = null;
      setDragPos(null);
    }

    const isAI = el.source === "ai";
    return (
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ left: cur.x, top: cur.y, width: NODE_W, minHeight: NODE_H }}
        className={`group absolute cursor-grab active:cursor-grabbing select-none rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md ${
          isAI ? "border-violet-500/30" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground/5 text-[10px] font-semibold text-foreground">
            {idx + 1}
          </span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${isAI ? TAG_STYLES.mediator : "border-border bg-background text-muted-foreground"}`}>
            {isAI ? "ai" : "team"}
          </span>
          {(el.created_by === user?.id || isAI) && (
            <button
              onClick={(e) => { e.stopPropagation(); void removeElement(el.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="opacity-0 transition group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-foreground">{el.data.text}</p>
      </div>
    );
  }

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[minmax(340px,420px)_1fr]">
      {/* LEFT — Room (intros + chat merged) */}
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Room</h2>
            <p className="text-xs text-muted-foreground">{participants.length} here · everything in one thread</p>
          </div>
          <div className="flex -space-x-1.5">
            {participants.slice(0, 5).map((p) => (
              <div
                key={p.user_id}
                title={p.display_name ?? "Someone"}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-card bg-muted text-[11px] font-medium text-foreground"
              >
                {(p.display_name ?? "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {participants.length > 5 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-card bg-muted text-[10px] text-muted-foreground">
                +{participants.length - 5}
              </div>
            )}
          </div>
        </header>

        {/* Listen bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${listening ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30"}`} />
            <span className="text-xs text-foreground">
              {listening ? `Listening · ${mmss(elapsed)}` : "Live transcription"}
            </span>
          </div>
          {!listening ? (
            <Button onClick={startListening} size="sm" variant="outline" className="h-7 rounded-md text-xs">Start</Button>
          ) : (
            <Button onClick={stopListening} size="sm" variant="outline" className="h-7 rounded-md text-xs">Stop</Button>
          )}
        </div>
        {listening && liveText && (
          <p className="border-b border-border px-4 py-2 text-xs italic text-muted-foreground">{liveText}</p>
        )}

        {/* Feed */}
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto px-4 py-3">
          {feed.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Say hi, type a message, or start listening.
            </p>
          )}
          {feed.map((item) => (
            <div key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg border ${item.mine ? "border-border bg-background" : "border-border bg-background"} px-3 py-2`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-foreground">{item.author}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${TAG_STYLES[item.tag]}`}>
                    {TAG_LABELS[item.tag]}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-foreground">{item.body}</p>
              </div>
            </div>
          ))}
          <div ref={feedEndRef} />
        </div>

        {/* Composer */}
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setComposerMode("chat")}
              className={`rounded-md px-2 py-1 text-[11px] ${composerMode === "chat" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Chat
            </button>
            <button
              onClick={() => setComposerMode("intro")}
              className={`rounded-md px-2 py-1 text-[11px] ${composerMode === "intro" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Intro
            </button>
          </div>
          {composerMode === "intro" && (
            <Input
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="Your role (optional)"
              className="h-8 rounded-md text-xs"
            />
          )}
          <div className="flex gap-2">
            <Input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendComposer();
                }
              }}
              placeholder={composerMode === "intro" ? "Hi, I'm here to help with…" : "Message the room…"}
              className="h-9 rounded-md text-sm"
            />
            <Button onClick={sendComposer} size="sm" className="h-9 rounded-md">Send</Button>
          </div>
        </div>
      </section>

      {/* RIGHT — Collaborative flow canvas */}
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Flow canvas</h2>
            <p className="text-xs text-muted-foreground">
              {autoFlow ? (autoBusy ? "Updating from the conversation…" : "Auto-sketching · drag to arrange together") : "Manual mode · drag to arrange together"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={autoFlow}
                onChange={(e) => setAutoFlow(e.target.checked)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              Auto
            </label>
            <Button
              onClick={() => void suggestFlow(false)}
              disabled={suggesting}
              size="sm"
              variant="outline"
              className="h-7 rounded-md text-xs"
            >
              {suggesting ? "Sketching…" : "Sketch now"}
            </Button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-auto">
          <div
            className="relative"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              backgroundImage:
                "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {flow.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  Empty canvas. Add a step below or let the conversation fill it.
                </p>
              </div>
            )}
            {flow.map((el, idx) => (
              <NodeCard key={el.id} el={el} idx={idx} />
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <Input
            value={flowText}
            onChange={(e) => setFlowText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void addFlowStep();
              }
            }}
            placeholder="Add a step to the canvas…"
            className="h-9 rounded-md text-sm"
          />
          <Button onClick={addFlowStep} size="sm" className="h-9 rounded-md">Add</Button>
        </div>
      </section>
    </div>
  );
}
