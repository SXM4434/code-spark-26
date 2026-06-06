import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Option = { id: string; label: string };
type Poll = {
  id: string;
  question: string;
  options: Option[];
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
};
type Vote = { poll_id: string; user_id: string; option_id: string };

export function PollsPanel({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Yes\nNo");

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`polls:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "polls", filter: `session_id=eq.${sessionId}` },
        () => load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "vote_responses" }, () => loadVotes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  async function load() {
    const { data } = await supabase
      .from("polls")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    setPolls((data as Poll[]) ?? []);
    await loadVotes((data as Poll[]) ?? []);
  }
  async function loadVotes(ps?: Poll[]) {
    const list = ps ?? polls;
    if (list.length === 0) { setVotes([]); return; }
    const { data } = await supabase
      .from("vote_responses")
      .select("poll_id,user_id,option_id")
      .in("poll_id", list.map((p) => p.id));
    setVotes((data as Vote[]) ?? []);
  }

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !question.trim()) return;
    const opts = optionsText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6);
    if (opts.length < 2) { toast.error("Add at least 2 options"); return; }
    const options: Option[] = opts.map((label, i) => ({ id: `o${i + 1}`, label }));
    const { error } = await supabase.from("polls").insert({
      session_id: sessionId,
      question: question.trim(),
      options,
      created_by: user.id,
      status: "open",
    });
    if (error) { toast.error(error.message); return; }
    setQuestion(""); setOptionsText("Yes\nNo"); setCreating(false);
  }

  async function vote(poll: Poll, optionId: string) {
    if (!user) return;
    const existing = votes.find((v) => v.poll_id === poll.id && v.user_id === user.id);
    if (existing) {
      await supabase.from("vote_responses").update({ option_id: optionId }).eq("poll_id", poll.id).eq("user_id", user.id);
    } else {
      await supabase.from("vote_responses").insert({ poll_id: poll.id, user_id: user.id, option_id: optionId });
    }
    await loadVotes();
  }

  async function close(poll: Poll) {
    await supabase.from("polls").update({ status: "closed" }).eq("id", poll.id);
    const tallies = poll.options.map((o) => {
      const count = votes.filter((v) => v.poll_id === poll.id && v.option_id === o.id).length;
      return `${o.label}: ${count}`;
    }).join(" · ");
    await supabase.from("messages").insert({
      session_id: sessionId,
      user_id: user?.id ?? null,
      content: `📊 Poll closed — "${poll.question}" → ${tallies}`,
      kind: "system",
    });
  }

  return (
    <div className="sticker flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink">Polls</h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating((v) => !v)} className="doodle-btn rounded-full">
          {creating ? "Cancel" : "+ New poll"}
        </Button>
      </div>

      {creating && (
        <form onSubmit={createPoll} className="mt-3 space-y-2 rounded-xl border-2 border-ink/20 bg-card p-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question…"
            className="sticker-sm w-full bg-background px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="One option per line"
            rows={3}
            className="sticker-sm w-full bg-background px-3 py-2 text-sm outline-none"
          />
          <Button type="submit" className="doodle-btn rounded-full bg-primary">Post poll</Button>
        </form>
      )}

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {polls.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No polls yet — start one to take the room's temperature.</p>
        )}
        {polls.map((p) => {
          const myVote = votes.find((v) => v.poll_id === p.id && v.user_id === user?.id)?.option_id;
          const total = votes.filter((v) => v.poll_id === p.id).length || 1;
          const canClose = p.created_by === user?.id && p.status === "open";
          return (
            <div key={p.id} className="sticker-sm bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-display font-bold text-ink">{p.question}</h4>
                <span className={`rounded-full px-2 py-0.5 font-display text-[10px] ${p.status === "open" ? "bg-secondary" : "bg-muted text-muted-foreground"}`}>{p.status}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {p.options.map((o) => {
                  const count = votes.filter((v) => v.poll_id === p.id && v.option_id === o.id).length;
                  const pct = Math.round((count / total) * 100);
                  const mine = myVote === o.id;
                  return (
                    <button
                      key={o.id}
                      disabled={p.status === "closed"}
                      onClick={() => vote(p, o.id)}
                      className={`relative block w-full overflow-hidden rounded-xl border-2 px-3 py-1.5 text-left text-sm transition ${mine ? "border-primary" : "border-ink/20"} ${p.status === "closed" ? "opacity-70" : "hover:border-ink"}`}
                    >
                      <div className="absolute inset-y-0 left-0 bg-accent/50" style={{ width: `${pct}%` }} />
                      <div className="relative flex items-center justify-between">
                        <span>{mine ? "● " : ""}{o.label}</span>
                        <span className="font-display text-xs">{count} · {pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {canClose && (
                <Button size="sm" variant="secondary" onClick={() => close(p)} className="doodle-btn mt-2 rounded-full">
                  Close poll
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
