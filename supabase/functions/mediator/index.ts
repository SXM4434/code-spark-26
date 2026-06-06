// Cartoonist AI mediator — two modes:
//  - default: drops a short mediator note + stickies (only when explicitly asked)
//  - mode: "flow": returns a process-flow JSON of steps + connections WITHOUT writing chat
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Cartoonist — a playful, warm AI mediator for team meetings.
You quietly listen, then chime in to:
- surface ideas that were overlooked or said by quieter voices
- name unresolved threads or tensions
- suggest a concrete next step

Be brief. Sound human, never corporate. One short paragraph (<=60 words) plus 1-3 short sticky-note ideas that capture the gist of what people are saying or proposing. Stickies are <=8 words each.`;

const FLOW_SYSTEM = `You are sketching a live PROCESS FLOW DIAGRAM from a team's conversation.

Listen to what they're actually building or describing and turn it into a clean, sequential process flow — like a flowchart someone would draw on a whiteboard. Focus on what matters; ignore small talk.

Rules:
- 4-8 steps, each 2-6 words, action-oriented (e.g. "User signs up", "Send verify email", "Pick plan").
- Steps must flow in order. Edges describe transitions (e.g. "if free", "after payment", "on error").
- Keep it concrete and visual — what HAPPENS, not what people said.
- If the conversation hasn't converged, draw the best current understanding.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const { session_id, mode } = body ?? {};
    if (!session_id) return j({ error: "session_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return j({ error: "LOVABLE_API_KEY missing" }, 500);

    // ---------- FLOW MODE: return JSON steps, do NOT write chat ----------
    if (mode === "flow") {
      const prompt: string = typeof body.prompt === "string" ? body.prompt : "";
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: FLOW_SYSTEM },
            { role: "user", content: prompt || "No conversation yet." },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "process_flow",
                description: "Sequential process-flow diagram of the team's conversation",
                parameters: {
                  type: "object",
                  properties: {
                    steps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "Short stable id like s1, s2" },
                          label: { type: "string", description: "2-6 word step label" },
                          kind: { type: "string", enum: ["start", "action", "decision", "end"] },
                        },
                        required: ["id", "label", "kind"],
                        additionalProperties: false,
                      },
                    },
                    edges: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          from: { type: "string" },
                          to: { type: "string" },
                          label: { type: "string", description: "Optional short transition label" },
                        },
                        required: ["from", "to"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["steps", "edges"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "process_flow" } },
        }),
      });
      if (!aiResp.ok) {
        const text = await aiResp.text();
        console.error("flow AI error", aiResp.status, text);
        if (aiResp.status === 429) return j({ error: "Rate limited" }, 429);
        if (aiResp.status === 402) return j({ error: "Out of AI credits" }, 402);
        return j({ error: "AI failed" }, 500);
      }
      const aiData = await aiResp.json();
      const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) return j({ error: "no tool call" }, 500);
      const parsed = JSON.parse(call.function.arguments);
      return j({ ok: true, flow: parsed });
    }

    // ---------- DEFAULT MEDIATOR MODE (only when explicitly asked) ----------
    const { data: msgs } = await supabase
      .from("messages")
      .select("id,user_id,content,kind,is_anonymous,created_at")
      .eq("session_id", session_id)
      .in("kind", ["chat", "voice", "anon_note"])
      .order("created_at", { ascending: false })
      .limit(40);
    const recent = (msgs ?? []).reverse();

    if (recent.length === 0) {
      return j({ skipped: true, reason: "no_messages" });
    }

    const ids = Array.from(new Set(recent.map((m: any) => m.user_id).filter(Boolean)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,display_name,personality_type").in("id", ids)
      : { data: [] as any[] };
    const nameOf = (uid: string | null) => {
      if (!uid) return "anon";
      const p = profs?.find((x: any) => x.id === uid);
      return p?.display_name ?? "Someone";
    };
    const transcript = recent
      .map((m: any) => {
        const tag = m.kind === "anon_note" ? "🤫 anonymous" : m.kind === "voice" ? "🎙" : "💬";
        const who = m.is_anonymous ? "anon" : nameOf(m.user_id);
        return `${tag} ${who}: ${m.content}`;
      })
      .join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Here are the last messages in the room:\n\n${transcript}\n\nWrite your mediator note and stickies now.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "mediator_response",
              description: "Mediator narrative + stickies to drop on the whiteboard",
              parameters: {
                type: "object",
                properties: {
                  note: { type: "string", description: "Short mediator paragraph for chat." },
                  stickies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        kind: { type: "string", enum: ["idea", "theme", "decision", "question"] },
                      },
                      required: ["label", "kind"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["note", "stickies"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "mediator_response" } },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("AI gateway error", aiResp.status, text);
      if (aiResp.status === 429) return j({ error: "Rate limited, slow down a sec." }, 429);
      if (aiResp.status === 402) return j({ error: "Out of AI credits. Add credits in workspace settings." }, 402);
      return j({ error: "AI failed" }, 500);
    }
    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return j({ error: "no tool call" }, 500);
    const parsed = JSON.parse(call.function.arguments);
    const note: string = parsed.note ?? "I'm listening.";
    const stickies: Array<{ label: string; kind: string }> = Array.isArray(parsed.stickies)
      ? parsed.stickies.slice(0, 3)
      : [];

    // Write mediator message to chat.
    await supabase.from("messages").insert({
      session_id,
      user_id: null,
      content: note,
      kind: "ai_mediator",
    });

    // Drop stickies onto whiteboard with scattered positions.
    if (stickies.length > 0) {
      const rows = stickies.map((s, i) => ({
        session_id,
        type: s.kind,
        data: { label: s.label, kind: s.kind },
        position: { x: 80 + (i % 3) * 220 + Math.floor(Math.random() * 30), y: 60 + Math.floor(i / 3) * 180 + Math.floor(Math.random() * 30) },
        source: "ai",
      }));
      await supabase.from("whiteboard_elements").insert(rows);
    }

    return j({ ok: true, note, stickies });
  } catch (e) {
    console.error("mediator error", e);
    return j({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
