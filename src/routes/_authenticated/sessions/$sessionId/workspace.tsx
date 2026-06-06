import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Mascot } from "@/components/Mascot";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId/workspace")({
  component: Workspace,
});

function Workspace() {
  const { sessionId } = Route.useParams();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="sticker p-10 text-center">
          <Mascot size={140} mood="thinking" className="mx-auto animate-bob" />
          <h1 className="mt-4 font-display text-3xl font-bold text-ink">Session workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Coming in Phase 2 — realtime chat, voice transcription, anonymous notes, mediator panel, and the live whiteboard.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Session: {sessionId}</p>
          <Link to="/dashboard" className="doodle-btn mt-6 inline-flex rounded-full bg-secondary px-5 py-2 font-display font-semibold text-secondary-foreground">
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
