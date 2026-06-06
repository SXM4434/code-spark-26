import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Mascot } from "./Mascot";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <header className="sticker mx-3 mt-3 flex items-center justify-between px-5 py-3">
      <Link to="/" className="flex items-center gap-3">
        <Mascot size={44} mood="wave" className="animate-bob" />
        <span className="font-display text-2xl font-bold text-ink">Cartoonist</span>
      </Link>
      <nav className="flex items-center gap-2">
        {user ? (
          <>
            <Link
              to="/dashboard"
              className="rounded-full px-3 py-1.5 font-display text-sm font-semibold text-ink hover:bg-accent/40"
            >
              Dashboard
            </Link>
            <Button onClick={signOut} variant="outline" size="sm" className="doodle-btn rounded-full">
              Sign out
            </Button>
          </>
        ) : (
          <Link to="/auth">
            <Button size="sm" className="doodle-btn rounded-full bg-primary text-primary-foreground">
              Get started
            </Button>
          </Link>
        )}
      </nav>
    </header>
  );
}
