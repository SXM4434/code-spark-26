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
  data: {
    text?: string;
    author?: string;
    role?: string;
    stepId?: string;
    kind?: string;
    from?: string;
    to?: string;
    label?: string | null;
    color?: string;
  };
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
  intro: "intro", spoken: "spoken", chat: "chat", voice: "voice",
  mediator: "mediator", system: "system", whisper: "whisper", poll: "poll",
};

// Canvas sizing — generous virtual surface
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const NODE_W = 200;
const NODE_H = 110;

// Sticky-note palette — playful but professional
const STICKY_COLORS = [
  { bg: "#fef3c7", border: "#fcd34d", ink: "#78350f" }, // amber
  { bg: "#fce7f3", border: "#f9a8d4", ink: "#831843" }, // pink
  { bg: "#dcfce7", border: "#86efac", ink: "#14532d" }, // mint
  { bg: "#dbeafe", border: "#93c5fd", ink: "#1e3a8a" }, // sky
  { bg: "#ede9fe", border: "#c4b5fd", ink: "#4c1d95" }, // lavender
  { bg: "#ffedd5", border: "#fdba74", ink: "#7c2d12" }, // peach
];

function hashIdx(s: string, n: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}
function stickyFor(el: WBElement) {
  if (el.data.color) {
    const m = STICKY_COLORS.find((c) => c.bg === el.data.color);
    if (m) return m;
  }
  return STICKY_COLORS[hashIdx(el.id, STICKY_COLORS.length)];
}
function rotFor(id: string) {
  return hashIdx(id, 7) - 3; // -3..3 deg
}

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
  const [suggesting, setSuggesting] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [autoFlow, setAutoFlow] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  // Canvas interaction state
  const [linkFromStep, setLinkFromStep] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const flowDebounceRef = useRef<number | null>(null);
  const lastSigRef = useRef<string>("");

  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user?.id]);

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
      .in("type", ["intro", "flow_step", "flow_edge"])
      .order("created_at", { ascending: true });
    setElements((data ?? []) as WBElement[]);
  }

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("id,user_id,content,kind,created_at,is_anonymous")
      .eq("session_id", sessionId)
      .in("kind", ["chat", "voice", "system", "anon_note"])
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
          if (["chat", "voice", "system", "anon_note"].includes(m.kind)) {
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
    return () => { supabase.removeChannel(ch); };
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

  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [feed.length]);

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

  // ---------- Composer ----------
  async function sendComposer() {
    if (!user || !composer.trim()) return;
    const body = composer.trim();
    if (composerMode === "intro") {
      setComposer("");
      await supabase.from("whiteboard_elements").insert({
        session_id: sessionId,
        type: "intro",
        data: { text: body, author: nameMap[user.id] ?? "Someone", role: roleText.trim() || null },
        position: { x: 0, y: 0 },
        created_by: user.id,
        source: "user",
      });
      setRoleText("");
    } else if (composerMode === "whisper") {
      setComposer("");
      await supabase.from("messages").insert({
        session_id: sessionId,
        user_id: user.id,
        content: body,
        kind: "anon_note",
        is_anonymous: true,
      });
    } else if (composerMode === "poll") {
      const opts = pollOptionsText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6);
      if (opts.length < 2) { toast.error("Add at least 2 options (one per line)"); return; }
      setComposer("");
      const options: PollOption[] = opts.map((label, i) => ({ id: `o${i + 1}`, label }));
      const { error } = await supabase.from("polls").insert({
        session_id: sessionId, question: body, options, created_by: user.id, status: "open",
      });
      if (error) toast.error(error.message); else setPollOptionsText("Yes\nNo");
    } else {
      setComposer("");
      await supabase.from("messages").insert({
        session_id: sessionId, user_id: user.id, content: body, kind: "chat",
      });
    }
  }

  // ---------- Canvas actions ----------
  function defaultPositionFor(idx: number) {
    const cols = 4;
    const gx = 60, gy = 60, sx = 260, sy = 160;
    return { x: gx + (idx % cols) * sx, y: gy + Math.floor(idx / cols) * sy };
  }

  async function addEmptyNote() {
    if (!user) return;
    const count = elements.filter((e) => e.type === "flow_step").length;
    const stepId = crypto.randomUUID();
    const { data, error } = await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "flow_step",
      data: { text: "New step", author: nameMap[user.id] ?? "Someone", stepId },
      position: defaultPositionFor(count),
      created_by: user.id,
      source: "user",
    }).select("id").single();
    if (!error && data) setEditingId(data.id);
  }

  async function removeElement(id: string) {
    // Also clean up edges referencing this node's stepId
    const node = elements.find((e) => e.id === id);
    const stepId = node?.data.stepId;
    await supabase.from("whiteboard_elements").delete().eq("id", id);
    if (stepId) {
      const orphanEdges = elements.filter((e) =>
        e.type === "flow_edge" && (e.data.from === stepId || e.data.to === stepId),
      );
      if (orphanEdges.length) {
        await supabase.from("whiteboard_elements").delete().in("id", orphanEdges.map((e) => e.id));
      }
    }
  }

  async function updateNodePosition(id: string, pos: { x: number; y: number }) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, position: pos } : el)));
    await supabase.from("whiteboard_elements").update({ position: pos }).eq("id", id);
  }

  async function saveNodeText(el: WBElement, text: string) {
    const next = { ...el.data, text };
    setElements((prev) => prev.map((x) => (x.id === el.id ? { ...x, data: next } : x)));
    await supabase.from("whiteboard_elements").update({ data: next }).eq("id", el.id);
  }

  async function cycleColor(el: WBElement) {
    const cur = stickyFor(el).bg;
    const idx = STICKY_COLORS.findIndex((c) => c.bg === cur);
    const next = STICKY_COLORS[(idx + 1) % STICKY_COLORS.length].bg;
    const data = { ...el.data, color: next };
    setElements((prev) => prev.map((x) => (x.id === el.id ? { ...x, data } : x)));
    await supabase.from("whiteboard_elements").update({ data }).eq("id", el.id);
  }

  async function createEdge(fromKey: string, toKey: string) {
    if (!user || fromKey === toKey) return;
    // Avoid duplicates
    if (elements.some((e) => e.type === "flow_edge" && e.data.from === fromKey && e.data.to === toKey)) return;
    await supabase.from("whiteboard_elements").insert({
      session_id: sessionId,
      type: "flow_edge",
      data: { from: fromKey, to: toKey },
      position: { x: 0, y: 0 },
      created_by: user.id,
      source: "user",
    });
  }

  function flowLayoutFor(idx: number) {
    const cols = 4;
    const gx = 60, gy = 80, sx = 240, sy = 160;
    return { x: gx + (idx % cols) * sx, y: gy + Math.floor(idx / cols) * sy };
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
          mode: "flow",
          prompt: `Sketch the process flow being discussed.\n\nIntros:\n${introCtx}\n\nConversation:\n${chatCtx}`,
        },
      });
      if (error) throw error;
      const flow = data?.flow as
        | { steps?: Array<{ id: string; label: string; kind?: string }>; edges?: Array<{ from: string; to: string; label?: string }> }
        | undefined;
      const steps = flow?.steps ?? [];
      const edges = flow?.edges ?? [];
      if (steps.length === 0) return;

      const { data: existingAi } = await supabase
        .from("whiteboard_elements").select("id")
        .eq("session_id", sessionId).in("type", ["flow_step", "flow_edge"]).eq("source", "ai");
      if (existingAi?.length) {
        await supabase.from("whiteboard_elements").delete().in("id", existingAi.map((r) => r.id));
      }

      for (let i = 0; i < Math.min(steps.length, 8); i++) {
        const s = steps[i];
        await supabase.from("whiteboard_elements").insert({
          session_id: sessionId,
          type: "flow_step",
          data: { text: s.label, author: "Mediator", stepId: s.id, kind: s.kind ?? "action" },
          position: flowLayoutFor(i),
          created_by: user.id,
          source: "ai",
        });
      }

      if (edges.length) {
        const edgeRows = edges.slice(0, 12).map((e) => ({
          session_id: sessionId, type: "flow_edge",
          data: { from: e.from, to: e.to, label: e.label ?? null },
          position: { x: 0, y: 0 }, created_by: user.id, source: "ai",
        }));
        await supabase.from("whiteboard_elements").insert(edgeRows);
      }

      if (!silent) toast.success(`Sketched ${steps.length} steps`);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Couldn't sketch the flow");
    } finally {
      if (!silent) setSuggesting(false);
    }
  }

  const flow = elements.filter((e) => e.type === "flow_step");
  const flowEdges = elements.filter((e) => e.type === "flow_edge");

  // Map key (stepId || el.id) -> {cx,cy} for arrow routing
  function nodeCenters(): Record<string, { cx: number; cy: number }> {
    const out: Record<string, { cx: number; cy: number }> = {};
    flow.forEach((el, idx) => {
      const fb = flowLayoutFor(idx);
      const x = el.position?.x ?? fb.x;
      const y = el.position?.y ?? fb.y;
      const c = { cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
      if (el.data.stepId) out[el.data.stepId] = c;
      out[el.id] = c;
    });
    return out;
  }

  // ---------- Sticky note (draggable, editable, linkable) ----------
  function NodeCard({ el, idx }: { el: WBElement; idx: number }) {
    const fallback = defaultPositionFor(idx);
    const x = el.position?.x ?? fallback.x;
    const y = el.position?.y ?? fallback.y;
    const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
    const movedRef = useRef(false);
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const cur = dragPos ?? { x, y };
    const sticky = stickyFor(el);
    const rot = rotFor(el.id);
    const isEditing = editingId === el.id;
    const linkKey = el.data.stepId ?? el.id;
    const isLinkSource = linkFromStep === linkKey;
    const isLinkTarget = linkFromStep !== null && !isLinkSource;
    const isAI = el.source === "ai";
    const canEdit = el.created_by === user?.id || isAI;

    function onPointerDown(e: React.PointerEvent) {
      if (isEditing) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragOffset.current = { dx: e.clientX - cur.x, dy: e.clientY - cur.y };
      movedRef.current = false;
      setDragPos(cur);
    }
    function onPointerMove(e: React.PointerEvent) {
      if (!dragOffset.current) return;
      const nx = Math.max(0, Math.min(CANVAS_W - NODE_W, e.clientX - dragOffset.current.dx));
      const ny = Math.max(0, Math.min(CANVAS_H - NODE_H, e.clientY - dragOffset.current.dy));
      if (Math.abs(nx - cur.x) + Math.abs(ny - cur.y) > 3) movedRef.current = true;
      setDragPos({ x: nx, y: ny });
    }
    function onPointerUp() {
      const wasDragging = dragOffset.current !== null;
      const moved = movedRef.current;
      if (wasDragging && moved && dragPos) void updateNodePosition(el.id, dragPos);
      dragOffset.current = null;
      setDragPos(null);
      // Click (no drag) handles linking
      if (wasDragging && !moved) {
        if (linkFromStep && !isLinkSource) {
          void createEdge(linkFromStep, linkKey);
          setLinkFromStep(null);
        } else if (isLinkSource) {
          setLinkFromStep(null);
        }
      }
      movedRef.current = false;
    }

    return (
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) setEditingId(el.id); }}
        style={{
          left: cur.x, top: cur.y, width: NODE_W, minHeight: NODE_H,
          background: sticky.bg,
          borderColor: sticky.border,
          color: sticky.ink,
          transform: `rotate(${dragPos ? 0 : rot}deg)`,
          boxShadow: dragPos
            ? "0 14px 30px -10px rgba(0,0,0,0.35)"
            : "0 6px 14px -8px rgba(0,0,0,0.25), 0 2px 4px -2px rgba(0,0,0,0.15)",
        }}
        className={`group absolute select-none rounded-[6px] border p-3 transition-shadow ${
          isEditing ? "cursor-text" : "cursor-grab active:cursor-grabbing"
        } ${isLinkSource ? "ring-2 ring-foreground" : ""} ${isLinkTarget ? "ring-2 ring-foreground/40" : ""}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(0,0,0,0.08)", color: sticky.ink }}
          >
            {idx + 1}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
            style={{ background: "rgba(0,0,0,0.06)", color: sticky.ink, opacity: 0.75 }}
          >
            {isAI ? "ai" : "team"}
          </span>
          <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {canEdit && (
              <>
                <button
                  title="Cycle color"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void cycleColor(el); }}
                  className="h-4 w-4 rounded-full border"
                  style={{ background: sticky.border, borderColor: sticky.ink }}
                />
                <button
                  title="Edit text"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setEditingId(el.id); }}
                  className="text-[10px] leading-none"
                  style={{ color: sticky.ink }}
                >
                  ✎
                </button>
                <button
                  title="Delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); void removeElement(el.id); }}
                  className="text-[12px] leading-none"
                  style={{ color: sticky.ink }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <textarea
            autoFocus
            defaultValue={el.data.text ?? ""}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => { void saveNodeText(el, e.target.value); setEditingId(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              } else if (e.key === "Escape") {
                setEditingId(null);
              }
            }}
            className="mt-1.5 w-full resize-none bg-transparent text-[13px] leading-snug outline-none"
            style={{ color: sticky.ink, minHeight: 48 }}
          />
        ) : (
          <p className="mt-1.5 break-words text-[13px] leading-snug" style={{ color: sticky.ink }}>
            {el.data.text || <span className="opacity-50">Double-click to edit…</span>}
          </p>
        )}

        {/* Connector handle on the right edge */}
        <button
          title={isLinkSource ? "Cancel link" : "Drag a connector from here"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setLinkFromStep(isLinkSource ? null : linkKey);
          }}
          className={`absolute -right-2 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-bold transition ${
            isLinkSource ? "scale-110" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            background: isLinkSource ? sticky.ink : sticky.bg,
            color: isLinkSource ? sticky.bg : sticky.ink,
            borderColor: sticky.ink,
          }}
        >
          →
        </button>
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

        {/* Push-to-talk bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${listening ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30"}`} />
            <span className="text-xs text-foreground">
              {listening ? `Speaking · ${mmss(elapsed)}` : "Hold to speak"}
            </span>
          </div>
          <Button
            onPointerDown={(e) => { e.preventDefault(); if (!listening) void startListening(); }}
            onPointerUp={() => { if (listening) stopListening(); }}
            onPointerLeave={() => { if (listening) stopListening(); }}
            onPointerCancel={() => { if (listening) stopListening(); }}
            size="sm"
            variant={listening ? "default" : "outline"}
            className="h-7 select-none rounded-md text-xs"
          >
            {listening ? "● Recording — release to stop" : "🎙 Hold to speak"}
          </Button>
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
          {feed.map((item) => {
            if (item.tag === "poll" && item.poll) {
              const p = item.poll;
              const total = votes.filter((v) => v.poll_id === p.id).length || 1;
              const myVote = votes.find((v) => v.poll_id === p.id && v.user_id === user?.id)?.option_id;
              const canClose = p.created_by === user?.id && p.status === "open";
              return (
                <div key={item.id} className="flex justify-start">
                  <div className="w-full max-w-[95%] rounded-lg border border-border bg-background px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-foreground">{item.author}</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${TAG_STYLES.poll}`}>poll</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{p.status}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] font-medium text-foreground">{p.question}</p>
                    <div className="mt-2 space-y-1">
                      {p.options.map((o) => {
                        const count = votes.filter((v) => v.poll_id === p.id && v.option_id === o.id).length;
                        const pct = Math.round((count / total) * 100);
                        const mine = myVote === o.id;
                        return (
                          <button
                            key={o.id}
                            disabled={p.status === "closed"}
                            onClick={() => void votePoll(p.id, o.id)}
                            className={`relative block w-full overflow-hidden rounded-md border px-2 py-1 text-left text-[12px] transition ${mine ? "border-foreground" : "border-border"} ${p.status === "closed" ? "opacity-70" : "hover:border-foreground/60"}`}
                          >
                            <div className="absolute inset-y-0 left-0 bg-cyan-500/15" style={{ width: `${pct}%` }} />
                            <div className="relative flex items-center justify-between">
                              <span>{mine ? "● " : ""}{o.label}</span>
                              <span className="text-[10px] text-muted-foreground">{count} · {pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {canClose && (
                      <button
                        onClick={() => void closePoll(p)}
                        className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Close poll
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg border border-border bg-background px-3 py-2`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-foreground">{item.author}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${TAG_STYLES[item.tag]}`}>
                      {TAG_LABELS[item.tag]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-foreground">{item.body}</p>
                </div>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>

        {/* Composer */}
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <select
              value={composerMode}
              onChange={(e) => setComposerMode(e.target.value as typeof composerMode)}
              className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none"
            >
              <option value="chat">💬 Chat</option>
              <option value="intro">👋 Intro</option>
              <option value="whisper">🤫 Whisper (anonymous)</option>
              <option value="poll">📊 Poll</option>
            </select>
            <span className="text-[10px] text-muted-foreground">
              {composerMode === "whisper" && "Nobody sees who sent it."}
              {composerMode === "intro" && "Posted as your intro."}
              {composerMode === "poll" && "Question + options below."}
              {composerMode === "chat" && "Message the room."}
            </span>
          </div>
          {composerMode === "intro" && (
            <Input
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="Your role (optional)"
              className="h-8 rounded-md text-xs"
            />
          )}
          {composerMode === "poll" && (
            <textarea
              value={pollOptionsText}
              onChange={(e) => setPollOptionsText(e.target.value)}
              placeholder="One option per line"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
            />
          )}
          <div className="flex gap-2">
            <Input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendComposer(); }
              }}
              placeholder={
                composerMode === "intro" ? "Hi, I'm here to help with…" :
                composerMode === "whisper" ? "Whisper an idea anonymously…" :
                composerMode === "poll" ? "Ask a question…" :
                "Message the room…"
              }
              className="h-9 rounded-md text-sm"
            />
            <Button onClick={sendComposer} size="sm" className="h-9 rounded-md">
              {composerMode === "poll" ? "Post" : "Send"}
            </Button>
          </div>
        </div>
      </section>

      {/* RIGHT — Sticky-note process flow canvas */}
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Process flow</h2>
            <p className="text-xs text-muted-foreground">
              {linkFromStep
                ? "Click another note to connect — or click the source again to cancel."
                : autoFlow
                  ? (autoBusy ? "Updating from the conversation…" : "Drag · double-click to edit · → to connect")
                  : "Manual mode · drag, edit, and connect"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={addEmptyNote} size="sm" variant="outline" className="h-7 rounded-md text-xs">
              + Note
            </Button>
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

        <div
          className="flex-1 min-h-0 overflow-auto"
          onClick={() => { if (linkFromStep) setLinkFromStep(null); }}
        >
          <div
            className="relative"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              backgroundColor: "hsl(var(--muted) / 0.3)",
              backgroundImage:
                "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {flow.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Blank canvas. Add a note, or let the conversation fill it in.
                </p>
                <Button onClick={addEmptyNote} size="sm" variant="outline" className="h-7 rounded-md text-xs">
                  + Add your first note
                </Button>
              </div>
            )}
            {flow.map((el, idx) => (
              <NodeCard key={el.id} el={el} idx={idx} />
            ))}
            {/* Arrows */}
            {(() => {
              const centers = nodeCenters();
              return (
                <svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={CANVAS_H}>
                  <defs>
                    <marker
                      id="flow-arrow"
                      viewBox="0 0 10 10"
                      refX="9" refY="5"
                      markerWidth="6" markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--foreground) / 0.55)" />
                    </marker>
                  </defs>
                  {flowEdges.map((e) => {
                    const a = e.data.from ? centers[e.data.from] : undefined;
                    const b = e.data.to ? centers[e.data.to] : undefined;
                    if (!a || !b) return null;
                    const dx = b.cx - a.cx;
                    const dy = b.cy - a.cy;
                    const len = Math.hypot(dx, dy) || 1;
                    const trimX = NODE_W / 2 - 8;
                    const trimY = NODE_H / 2 - 4;
                    const sx = a.cx + (dx / len) * trimX;
                    const sy = a.cy + (dy / len) * trimY;
                    const tx = b.cx - (dx / len) * trimX;
                    const ty = b.cy - (dy / len) * trimY;
                    const mx = (sx + tx) / 2;
                    const my = (sy + ty) / 2;
                    return (
                      <g key={e.id}>
                        <path
                          d={`M ${sx} ${sy} Q ${mx} ${my - 22} ${tx} ${ty}`}
                          fill="none"
                          stroke="hsl(var(--foreground) / 0.55)"
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          markerEnd="url(#flow-arrow)"
                        />
                        {e.data.label && (
                          <text
                            x={mx} y={my - 26}
                            textAnchor="middle"
                            className="fill-foreground"
                            style={{ fontSize: 10, opacity: 0.7 }}
                          >
                            {e.data.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>
      </section>
    </div>
  );
}
