# Cartoonist — Phase 1 (hybrid canvas foundation)

Locked decisions:
- Canvas: **React Flow** (structured AI shapes) layered with **Excalidraw** (freeform sketch). No tldraw.
- Sync: **Supabase Realtime** over `canvas_events` op log.
- Lock model: per-node `meta.lockMode` (`open` / `augment-only` / `hard`).
- Existing `MeetingRoomPanel` stays as fallback "Room" tab; new "Canvas" tab mounts the hybrid surface.

## What ships in Phase 1

1. **Schema (done)**: `canvas_events`, `ai_calls`, `migration_errors`, `sessions.meta`, realtime publication.
2. **Canvas mount** (`src/components/canvas/Canvas.tsx`): React Flow as the primary surface, Excalidraw mounted in a toggleable underlay for freeform pen/sketch. Shared `CanvasContext` exposes both engines.
3. **Custom React Flow nodes** in `src/components/canvas/shapes/`:
   - `WireframeFrame` — device chrome + editable slots
   - `JourneyStep` — step number, label, emotion bar
   - `Callout` — pointer + body, anchored
   - `SpeechBubble` — quote + attribution (for P3 replay)
   - Sticky / Text / Rect / Ellipse primitives
4. **Toolbar** (left rail): Select · Pan · Pen · Sticky · Text · Rect · Ellipse · Arrow · Frame · Eraser.
5. **Editorial theming** (`src/styles/canvas.css`): off-black surfaces, warm-orange accent, Fraunces titles, Inter body, square corners.
6. **AI bridge** (`src/lib/canvas/ai-bridge.ts`): `translateLegacy()` + `applyNative()`.
7. **Layout solver** (`src/lib/canvas/layout-solver.ts`): no-overdraw nudge.
8. **Op sync** (`src/lib/canvas/use-canvas-sync.ts`): React Flow store ↔ `canvas_events` ↔ Realtime.
9. **Cost meter** (`src/components/canvas/CostMeter.tsx`): HUD pill subscribing to `ai_calls`.
10. **Legacy migration** (`src/lib/canvas/legacy-to-canvas.ts`): one-time translator from `whiteboard_elements` to React Flow nodes; PNG fallback on translator failure.
11. **Soft-riff lock**: per-node `data.meta.lockMode`; right-click menu toggles `hard`; user edit flips to `augment-only`.

## Build order this turn

1. Install deps + save plan (in flight).
2. Canvas + theming + toolbar + custom nodes.
3. AI bridge, layout solver, sync hook.
4. Cost meter, legacy migration shim.
5. Wire into workspace as new "Canvas" tab, keep "Room" tab.

Phases 2–5 in `/dev-server/.lovable/roadmap.md` (pasted spec).
