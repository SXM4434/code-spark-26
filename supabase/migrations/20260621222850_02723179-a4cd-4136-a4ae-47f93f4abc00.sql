-- Phase 1 canvas foundation: op log, AI cost tracking, migration error sink, session meta.

-- 1. canvas_events: op-based persistence for the hybrid canvas
CREATE TABLE public.canvas_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  shape_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  t_offset_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX canvas_events_session_created_idx ON public.canvas_events(session_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas_events TO authenticated;
GRANT ALL ON public.canvas_events TO service_role;
ALTER TABLE public.canvas_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read canvas events"
  ON public.canvas_events FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants write canvas events"
  ON public.canvas_events FOR INSERT TO authenticated
  WITH CHECK (public.is_session_participant(session_id, auth.uid()) AND actor_id = auth.uid());
CREATE POLICY "Participants update own canvas events"
  ON public.canvas_events FOR UPDATE TO authenticated
  USING (actor_id = auth.uid());
CREATE POLICY "Participants delete own canvas events"
  ON public.canvas_events FOR DELETE TO authenticated
  USING (actor_id = auth.uid());

-- 2. ai_calls: cost meter source of truth
CREATE TABLE public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  model text NOT NULL,
  agent text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_calls_session_idx ON public.ai_calls(session_id, created_at);
GRANT SELECT ON public.ai_calls TO authenticated;
GRANT ALL ON public.ai_calls TO service_role;
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read AI cost"
  ON public.ai_calls FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));

-- 3. migration_errors: legacy-room translation failure sink
CREATE TABLE public.migration_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  source text NOT NULL,
  error text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.migration_errors TO authenticated;
GRANT ALL ON public.migration_errors TO service_role;
ALTER TABLE public.migration_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read migration errors"
  ON public.migration_errors FOR SELECT TO authenticated
  USING (session_id IS NULL OR public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants log migration errors"
  ON public.migration_errors FOR INSERT TO authenticated
  WITH CHECK (session_id IS NULL OR public.is_session_participant(session_id, auth.uid()));

-- 4. sessions.meta jsonb: schema version + soft-cost-cap toggle
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_calls;