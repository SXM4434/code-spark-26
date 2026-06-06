# Phases 3 & 4 — AI mediator, live whiteboard, polls, and generated docs

Building both phases together so the AI insights, the visual canvas, and the final documents share one mediator pipeline.

## Phase 3 — AI mediator + live whiteboard

### 3.1 Mediator edge function (`mediator`)
- Input: `session_id`, recent N messages (chat + voice + whisper)
- Calls Lovable AI (`google/gemini-3-flash-preview`) with a Cartoonist system prompt: surface overlooked ideas, name quieter voices, suggest the next step
- Output saved as `messages` row with `kind = 'ai_mediator'` so it streams into chat alongside humans
- Also returns 1–3 *sticky* suggestions written to `whiteboard_elements` (kind `sticky`)
- Triggered by: (a) host clicking the "Ask Cartoonist" pill in workspace, (b) auto-tick every 90s when ≥3 new human messages since last run

### 3.2 Live whiteboard (no React Flow — keep it light)
- New `WhiteboardPanel.tsx` rendering `whiteboard_elements` on a CSS-grid canvas as draggable sticker notes (sticky, idea, decision, theme)
- Realtime subscription on `whiteboard_elements`
- Anyone can drop a sticky; AI mediator drops its own (color-coded, mascot icon)
- Drag to reposition (updates `x, y`), double-click to edit, delete button for owner/host
- Replace current 3-panel layout with tabbed workspace: **Chat · Notes · Whiteboard · Polls**

### 3.3 Polls
- `polls` and `vote_responses` tables already exist
- `PollsPanel.tsx`: anyone creates a poll (question + 2–6 options), members vote once, results bar updates live via realtime
- Closing a poll writes a `messages` row (`kind = 'system'`) summarizing the result

### 3.4 Mascot reaction strip
- Small persistent mascot bubble at the top of the workspace showing the latest AI insight ("👀 Priya's pricing thread hasn't been answered — want me to nudge?")
- Fed by the latest `ai_mediator` message

## Phase 4 — Generated docs + wrap-up

### 4.1 Document generator edge function (`generate-docs`)
- Input: `session_id`, list of desired outputs (from `sessions.desired_outputs`)
- Pulls all messages + whiteboard + polls + action items
- One AI call per doc type using Lovable AI with tight JSON tool schemas, supported types:
  - Summary · PRD · User journey · Flow outline · Timeline · Problem statement · Decisions log · Action items · Team alignment
- Writes each as a row in `generated_artifacts` (`kind`, `title`, `body` markdown)
- Action items also fan out to the `action_items` table for the kanban view

### 4.2 Wrap-up flow
- "Generate docs" button in workspace header → calls function, shows progress per doc
- New route `/sessions/$sessionId/wrap` showing all artifacts as editable cards (markdown editor with live preview), plus the Team Alignment view (each participant's stated strength + how they showed up, derived from messages)
- Each artifact has: Copy markdown · Download `.md` · Edit inline (saves to `generated_artifacts.body`)
- Session status flips to `wrapped` when first generation completes

### 4.3 Polish
- Empty-state mascots on every new tab
- Toast on every realtime arrival (chat/sticky/poll) — debounced
- Keyboard: `Cmd+Enter` send, `Cmd+K` ask Cartoonist, `Cmd+B` toggle whiteboard

## Schema work
- All target tables exist — no new tables needed
- Migration only if columns missing: confirm `whiteboard_elements` has `x, y, kind, body, author_id, color`; `polls` has `question, options jsonb, created_by, closed_at`; `generated_artifacts` has `kind, title, body, updated_at`. Add what's missing in one migration with proper GRANTs + RLS scoped to session participants
- Enable realtime publication on `whiteboard_elements`, `polls`, `vote_responses`, `generated_artifacts`, `action_items`

## Edge functions
- `mediator` — recurring AI insight + stickies
- `generate-docs` — final artifact generation
- Both use `LOVABLE_API_KEY` (already configured), call via Lovable AI Gateway, return graceful 429/402 errors that the UI toasts

## What's out of scope (for now)
- No real-time voice transcription pipeline beyond browser Web Speech (already in place)
- No multi-cursor whiteboard collaboration (positions sync, but no live cursors)
- No PDF export of generated docs (markdown + copy/download only)
- No personality questionnaire — strength is inferred from existing onboarding profile + message patterns

## Build order
1. Migration (any missing columns + realtime publication)
2. `mediator` edge fn + Mascot reaction strip + manual "Ask Cartoonist" trigger
3. `WhiteboardPanel` + tabbed workspace
4. `PollsPanel`
5. `generate-docs` edge fn + `/wrap` route + artifact editors
6. Auto-tick mediator + keyboard shortcuts + polish

Approve and I'll build straight through.
