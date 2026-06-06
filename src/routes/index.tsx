import { createFileRoute, Link } from "@tanstack/react-router";
import { Mascot } from "@/components/Mascot";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border-2 border-ink bg-accent px-3 py-1 font-display text-xs font-semibold text-ink">
              Hackathon 2026 ✦ AI mediator for teams
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-tight text-ink md:text-6xl">
              Teams that draw it out, <span className="text-primary">together.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Cartoonist quietly listens to your meetings — surfacing overlooked ideas,
              drawing the conversation live, and turning the messy back-and-forth into
              shippable plans.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/auth">
                <button className="doodle-btn rounded-full bg-primary px-6 py-3 font-display text-lg font-semibold text-primary-foreground">
                  Start a session
                </button>
              </Link>
              <Link to="/auth">
                <button className="doodle-btn rounded-full bg-secondary px-6 py-3 font-display text-lg font-semibold text-secondary-foreground">
                  Join with a code
                </button>
              </Link>
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="absolute -left-4 top-6 h-32 w-32 -rotate-12 rounded-3xl bg-accent/70 sticker-sm p-3 font-display text-sm">
              "Someone has an idea 💡"
            </div>
            <div className="absolute -right-2 bottom-10 h-28 w-36 rotate-6 rounded-3xl bg-secondary/40 sticker-sm p-3 font-display text-sm">
              Live whiteboard 🎨
            </div>
            <Mascot size={280} mood="wave" className="animate-bob" />
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { t: "Hears everyone", d: "Quiet, analytical, introverted — Cartoonist surfaces ideas loud voices missed.", c: "bg-accent/50" },
            { t: "Draws live", d: "Watch the conversation become a living flow diagram on a shared canvas.", c: "bg-secondary/40" },
            { t: "Ships docs", d: "PRDs, user journeys, timelines, action items — generated and ready to edit.", c: "bg-highlight/30" },
          ].map((f) => (
            <div key={f.t} className={`sticker p-6 ${f.c}`}>
              <h3 className="font-display text-xl font-bold text-ink">{f.t}</h3>
              <p className="mt-2 text-sm text-ink/80">{f.d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
