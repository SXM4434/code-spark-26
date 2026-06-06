import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/hooks/use-speech";

type Msg = {
  id: string;
  user_id: string | null;
  content: string;
  kind: string;
  is_anonymous: boolean;
  created_at: string;
};

type Props = {
  sessionId: string;
  nameMap: Record<string, string>;
};

export function ChatPanel({ sessionId, nameMap }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const voice = useSpeechRecognition({ continuous: false });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .in("kind", ["chat", "voice", "ai_mediator", "system"])
        .order("created_at", { ascending: true });
      setMessages((data as Msg[]) ?? []);
    })();

    const ch = supabase
      .channel(`chat:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as Msg;
          if (["chat", "voice", "ai_mediator", "system"].includes(m.kind)) {
            setMessages((prev) => [...prev, m]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const [pendingVoice, setPendingVoice] = useState(false);

  async function send(kind: "chat" | "voice", body: string) {
    if (!user || !body.trim()) return;
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user.id,
      content: body.trim(),
      kind,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text;
    setText("");
    const wasVoice = pendingVoice;
    setPendingVoice(false);
    await send(wasVoice ? "voice" : "chat", t);
  }

  async function toggleVoice() {
    if (voice.listening) {
      voice.stop();
      setTimeout(() => {
        const t = voice.finalText.trim();
        if (t) {
          setText((prev) => (prev ? prev + " " : "") + t);
          setPendingVoice(true);
        }
        voice.reset();
      }, 250);
    } else {
      voice.start();
    }
  }

  return (
    <div className="sticker flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink">Conversation</h3>
        <span className="rounded-full bg-accent px-2 py-0.5 font-display text-xs">{messages.length}</span>
      </div>

      <div ref={scrollerRef} className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Say hi! Anything you type or speak shows up here.
          </p>
        )}
        {messages.map((m) => {
          const isMe = m.user_id === user?.id;
          const isAI = m.kind === "ai_mediator";
          const isSystem = m.kind === "system";
          const name = isAI ? "Cartoonist" : isSystem ? "system" : nameMap[m.user_id ?? ""] ?? "Someone";
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div
                className={`sticker-sm max-w-[80%] p-3 ${
                  isAI
                    ? "bg-accent"
                    : isSystem
                      ? "bg-muted text-muted-foreground"
                      : isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-[10px] opacity-70">
                  <span className="font-display font-bold">{name}</span>
                  {m.kind === "voice" && <span>· 🎙</span>}
                  {isAI && <span>· mediator</span>}
                </div>
                <div className="mt-1 text-sm">{m.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      {voice.listening && (
        <div className="mt-2 rounded-xl border-2 border-dashed border-primary bg-card p-2 text-xs text-muted-foreground">
          🎙 Listening… <span className="text-ink">{voice.interim || voice.finalText}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="sticker-sm flex-1 bg-card px-3 py-2 text-sm outline-none"
        />
        <Button type="button" variant="secondary" onClick={toggleVoice} className="doodle-btn rounded-full">
          {voice.listening ? "■" : "🎙"}
        </Button>
        <Button type="submit" className="doodle-btn rounded-full bg-primary">
          Send
        </Button>
      </form>
    </div>
  );
}
