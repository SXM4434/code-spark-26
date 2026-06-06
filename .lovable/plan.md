# Cartoonist — Build Plan

A real-time AI-mediated team collaboration platform. Building in 4 phases as specified in your brief. After each phase we verify it works before moving on.

## Phase 1 — Foundation (start here)
1. **Enable Lovable Cloud** (Supabase: auth, DB, storage, realtime, edge functions).
2. **Design system**: warm cream/coral/teal palette, Fredoka + Inter, sticker-style shadcn variants, hand-drawn SVG mascot component, doodle accents.
3. **Database schema + RLS** for all tables: `profiles`, `sessions`, `session_participants`, `messages`, `whiteboard_elements`, `generated_artifacts`, `polls`, `vote_responses`, `action_items`, `uploads`. Realtime enabled on the collaborative ones.
4. **Auth** (email/password + magic link) with `/auth` route.
5. **Profile onboarding** — personality type cards + strengths chips + name/avatar.
6. **Dashboard** — Start session / Join by code / past sessions grid with mascot empty state.
7. **Create session wizard** — type → mode → desired outputs → join code.
8. **Lobby** — participants join, set per-session personality, optional intro, host starts.

✅ **Checkpoint**: sign up, onboard, create + join a session by code, land in lobby.

## Phase 2 — Live collaboration
- Session Workspace shell (participants rail / chat / whiteboard placeholder / mediator placeholder / top bar).
- Realtime chat + presence via Supabase Realtime.
- Web Speech API voice transcription → writes `kind=voice` messages.
- Anonymous notes (`is_anonymous=true`).
- Personality badges + live presence dots.

✅ **Checkpoint**: two browsers in one session see each other's chat, voice, and anon notes live.

## Phase 3 — AI mediator + whiteboard
- React Flow canvas with draggable user stickies (writes `whiteboard_elements`).
- Edge function `mediator-monitor` (Lovable AI / Gemini) — surfaces quiet ideas, agreements, disagreements, talking points.
- Edge function `live-visual` — emits React Flow nodes/edges from the conversation.
- Mediator panel feed with reacting mascot.

✅ **Checkpoint**: AI cards appear as conversation flows; whiteboard updates live.

## Phase 4 — Decisions & documents
- Polls + live vote tallies.
- Edge function `generate-artifact` for: summary, PRD, user journey, product flow, timeline, problem statement, decisions, action items, team alignment.
- Documents view (tabs, editable, Markdown export).
- Action Item Kanban (Todo / Doing / Done).
- Team Alignment view from personalities + strengths.
- Uploads & Notes (files + links) feeding context.

✅ **Final checkpoint**: full acceptance list from §8 of the brief.

## Notes
- All AI calls go through edge functions using Lovable AI (Gemini). No client-side AI keys.
- Voice transcription uses the browser's Web Speech API (we'll show a "best in Chrome" hint).
- RLS on every table from day one.
- This is a large build — I'll implement Phase 1 in full, then pause for you to try it before starting Phase 2.

Ready to start Phase 1?
