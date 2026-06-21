import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = { sessionId: string };

export function CostMeter({ sessionId }: Props) {
  const [usd, setUsd] = useState(0);
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("ai_calls")
        .select("cost_usd,model,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!mounted || !data) return;
      setUsd(data.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0));
      setModel(data[0]?.model ?? null);
    })();
    const ch = supabase
      .channel(`cost:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_calls", filter: `session_id=eq.${sessionId}` },
        (msg) => {
          const row = msg.new as { cost_usd: number | string; model: string };
          setUsd((prev) => prev + Number(row.cost_usd ?? 0));
          setModel(row.model ?? null);
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  return (
    <div className="canvas-hud">
      <span className="dot" />
      <span>${usd.toFixed(3)}</span>
      {model && <span style={{ color: "var(--canvas-muted)" }}>· {model.split("/").pop()}</span>}
    </div>
  );
}
