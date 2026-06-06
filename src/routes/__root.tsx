import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="sticker max-w-md p-8 text-center">
        <h1 className="font-display text-6xl font-bold text-ink">404</h1>
        <p className="mt-3 text-muted-foreground">This page wandered off the page.</p>
        <Link
          to="/"
          className="doodle-btn mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 font-display font-semibold text-primary-foreground"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="sticker max-w-md p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Oops — that didn't draw right.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again?</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="doodle-btn mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 font-display font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Cartoonist — Teams that draw it out together" },
      { name: "description", content: "Cartoonist is an AI mediator for teams: it listens, surfaces quiet voices, draws live visuals, and turns conversations into shippable docs." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
