// Cartoonist doc generator — turns a session into shippable artifacts.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DocKind =
  | "summary"
  | "prd"
  | "user_journey"
  | "flow"
  | "timeline"
  | "problem_statement"
  | "decisions"
  | "action_items"
  | "team_alignment";

const DOC_PROMPTS: Record<DocKind, { title: string; ask: string }> = {
  summary: { title: "Session summary", ask: "A warm, plain-language 1-page summary of what the team discussed, decided, and is doing next. Use headings: What we talked about · What we decided · What's still open · Next step." },
  prd: { title: "PRD", ask: "A lightweight Product Requirements Document. Include: Problem · Users · Goals · Non-goals · Proposed solution · Open questions. Keep it crisp; markdown only." },
  user_journey: { title: "User journey", ask: "A step-by-step user journey. For each step include: trigger, action, feeling, friction. Use a markdown table or numbered list." },
  flow: { title: "Flow outline", ask: "An ASCII flow / outline of the proposed product or process. Use indented bullets and arrows so a teammate can read it linearly." },
  timeline: { title: "Timeline", ask: "A realistic delivery timeline as a markdown table: Phase · Outcome · Owner · Rough duration. 3-6 rows." },
  problem_statement: { title: "Problem statement", ask: "A single sharp problem statement (3-5 sentences) capturing who, what, why now, and the cost of doing nothing." },
  decisions: { title: "Decisions log", ask: "A markdown table of decisions made: Decision · Rationale · Made by. Pull only things the group actually agreed on." },
  action_items: { title: "Action items", ask: "A bulleted list of concrete next steps. Each line: '- [ ] <task> — owner: <name or unassigned>'. 4-10 items." },
  team_alignment: { title: "Team alignment", ask: "A short reflection on how the team showed up: one sentence per participant capturing their strength and the angle they brought. End with one paragraph on where alignment is strongest and where it's fragile." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { session_id, kinds } = await req.json();
    if (!session_id) return j({ error: "session_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gather everything.
    const { data: session } = await supabase.from("sessions").select("*").eq("id", session_id).maybeSingle();
    if (!session) return j({ error: "session not found" }, 404);

    const selectedKinds: DocKind[] = Array.isArray(kinds) && kinds.length > 0
      ? kinds.filter((k: string) => k in DOC_PROMPTS)
      : (session.desired_outputs?.length ? session.desired_outputs.filter((k: string) => k in DOC_PROMPTS) : ["summary", "decisions", "action_items"]);

    const { data: msgs } = await supabase
      .from("messages")
      .select("user_id,content,kind,is_anonymous,created_at")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });
    const { data: parts } = await supabase
      .from("session_participants")
      .select("user_id,personality_type")
      .eq("session_id", session_id);
    const ids = (parts ?? []).map((p: any) => p.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = (uid: string | null) => profs?.find((x: any) => x.id === uid)?.display_name ?? "Someone";

    const transcript = (msgs ?? [])
      .map((m: any) => {
        const who = m.is_anonymous ? "anon" : m.kind === "ai_mediator" ? "Cartoonist" : nameOf(m.user_id);
        const tag = m.kind === "anon_note" ? "(anon)" : m.kind === "voice" ? "(voice)" : m.kind === "ai_mediator" ? "(mediator)" : m.kind === "system" ? "(system)" : "";
        return `${who} ${tag}: ${m.content}`;
      })
      .join("\n");

    const { data: wbs } = await supabase.from("whiteboard_elements").select("type,data,source").eq("session_id", session_id);
    const stickies = (wbs ?? []).map((w: any) => `- [${w.type}] ${w.data?.label ?? ""} (${w.source})`).join("\n");

    const peopleList = (parts ?? [])
      .map((p: any) => `- ${nameOf(p.user_id)} (${p.personality_type ?? "unknown style"})`)
      .join("\n");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return j({ error: "LOVABLE_API_KEY missing" }, 500);

    const baseContext = `Session name: ${session.name}\nType: ${session.type}\n\nParticipants:\n${peopleList}\n\nWhiteboard:\n${stickies || "(none)"}\n\nTranscript:\n${transcript || "(empty)"}`;

    const generated: Array<{ kind: DocKind; title: string; body: string }> = [];

    for (const k of selectedKinds as DocKind[]) {
      const prompt = DOC_PROMPTS[k];
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are Cartoonist. Write crisp, useful markdown. Never invent participant quotes. If the transcript is thin, say so honestly in a one-line note at the bottom." },
            { role: "user", content: `${baseContext}\n\nTask: ${prompt.ask}\n\nReturn ONLY the markdown body (no surrounding code fence).` },
          ],
        }),
      });
      if (!aiResp.ok) {
        const text = await aiResp.text();
        console.error("AI gateway error", aiResp.status, text);
        if (aiResp.status === 429) return j({ error: "Rate limited. Wait a bit and try again." }, 429);
        if (aiResp.status === 402) return j({ error: "Out of AI credits. Add credits in workspace settings." }, 402);
        return j({ error: "AI failed" }, 500);
      }
      const aiData = await aiResp.json();
      const body: string = aiData.choices?.[0]?.message?.content ?? "(no content)";
      generated.push({ kind: k, title: prompt.title, body });

      // Upsert: delete existing then insert (simpler than handling version bumps)
      await supabase.from("generated_artifacts").delete().eq("session_id", session_id).eq("kind", k);
      await supabase.from("generated_artifacts").insert({
        session_id,
        kind: k,
        content: { title: prompt.title, body },
      });

      // Fan out action items into action_items table
      if (k === "action_items") {
        const lines = body.split("\n").filter((l) => /^\s*-\s*\[\s*[ x]\s*\]/i.test(l));
        if (lines.length > 0) {
          await supabase.from("action_items").delete().eq("session_id", session_id).eq("source", "ai");
          const rows = lines.slice(0, 20).map((l) => {
            const cleaned = l.replace(/^\s*-\s*\[\s*[ x]\s*\]\s*/i, "").trim();
            return { session_id, title: cleaned.slice(0, 220), source: "ai" };
          });
          if (rows.length) await supabase.from("action_items").insert(rows);
        }
      }
    }

    await supabase.from("sessions").update({ status: "wrapped" }).eq("id", session_id);

    return j({ ok: true, generated: generated.map((g) => ({ kind: g.kind, title: g.title })) });
  } catch (e) {
    console.error("generate-docs error", e);
    return j({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
