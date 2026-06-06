# Cartoonist Intro Deck — 10 slides, PPTX

A standalone, downloadable PowerPoint introducing Cartoonist. Built as an artifact (not part of the app routes), delivered to you as a `.pptx` file you can open, edit, and present.

## Visual direction

Match the app's playful "sticker" aesthetic:
- Warm cream background, ink-black text, primary coral/orange + soft accent yellow + sage secondary
- Display headings (bold, slightly oversized), clean sans body
- Rounded "sticker" cards with subtle borders, a little rotation for personality
- Cartoonist mascot motif on title + closing slides

## Slide outline (10)

1. **Title** — "Cartoonist" + tagline "Teams that draw it out, together." + mascot
2. **The problem** — Meetings overflow with voices, but the quiet ideas, structure, and decisions get lost
3. **The idea** — An AI mediator that listens, draws, and ships the conversation
4. **Design logic** — Three principles: *Hear everyone · Make it visible · Leave with something shippable*
5. **How it works** — Flow: Voice hello → Live chat + whisper notes → AI mediator + live whiteboard → Generated docs
6. **Inside a session** — Annotated screenshot/mock of the workspace (chat, notes, participants, mascot)
7. **What you leave with** — PRD, user journey, timeline, decisions, action items, team alignment view
8. **Why it's different** — Personality-aware, anonymous whispers, live visual, playful tone — not another transcript bot
9. **The team — by strength** — Grid of teammates with their superpower (name, role, strength tag). Placeholder names you fill in or tell me to pre-fill
10. **Closing / Try it** — Mascot wave, call to action, join code placeholder

## Team slide — what I need from you

For slide 9 I'll insert 4 placeholder cards (Name · Role · Strength) unless you give me the real list now. Strengths use single-word tags like "Systems thinker", "Storyteller", "Builder", "Researcher".

## Technical approach

- Use the bundled `pptx` skill with `pptxgenjs` (Node) to generate the file
- 16:9, semantic color palette mirroring `src/styles.css` tokens (ink, primary, accent, secondary, highlight, cream bg)
- Generate at `/mnt/documents/cartoonist-intro.pptx` and deliver via `<presentation-artifact>`
- QA pass: render to PDF → images → inspect each slide for overflow/contrast/placeholder leftovers → fix → re-verify
- No changes to the app codebase

## Out of scope

- No new routes or in-app slide viewer
- No PDF export (PPTX only, per your choice)
- No real team photos (text cards only unless you upload images)

Ready to build when you approve — and let me know if you want me to drop in real team names/strengths for slide 9, or leave placeholders.
