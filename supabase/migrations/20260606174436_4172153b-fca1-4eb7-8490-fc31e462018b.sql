
-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  personality_type TEXT,
  strengths TEXT[] DEFAULT '{}',
  bio TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by signed-in users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== SESSIONS =====
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hackathon','team_meeting','collaboration','brainstorm')),
  mode TEXT NOT NULL CHECK (mode IN ('audio','chat','both')),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','wrapped')),
  desired_outputs TEXT[] NOT NULL DEFAULT '{}',
  join_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== PARTICIPANTS =====
CREATE TABLE public.session_participants (
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host','member')),
  personality_type TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_participants TO authenticated;
GRANT ALL ON public.session_participants TO service_role;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

-- security-definer helper to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_session_participant(_session UUID, _user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.session_participants WHERE session_id = _session AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.is_session_host(_session UUID, _user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sessions WHERE id = _session AND host_id = _user);
$$;

-- session policies
CREATE POLICY "Participants can read sessions" ON public.sessions FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.is_session_participant(id, auth.uid()));
CREATE POLICY "Users create sessions as host" ON public.sessions FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "Host updates session" ON public.sessions FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY "Host deletes session" ON public.sessions FOR DELETE TO authenticated USING (host_id = auth.uid());

-- participant policies
CREATE POLICY "Read participants of own sessions" ON public.session_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Join as self" ON public.session_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own participant row" ON public.session_participants FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Leave own participant row" ON public.session_participants FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_session_host(session_id, auth.uid()));

-- lookup session by join code (used to join)
CREATE OR REPLACE FUNCTION public.find_session_by_code(_code TEXT)
RETURNS TABLE(id UUID, name TEXT, type TEXT, mode TEXT, status TEXT, host_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, type, mode, status, host_id FROM public.sessions WHERE join_code = upper(_code) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_session_by_code(TEXT) TO authenticated;

-- ===== MESSAGES =====
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','voice','anon_note','ai_mediator','system')),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants write messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()) AND (user_id = auth.uid() OR user_id IS NULL));

-- ===== WHITEBOARD =====
CREATE TABLE public.whiteboard_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  position JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whiteboard_elements TO authenticated;
GRANT ALL ON public.whiteboard_elements TO service_role;
ALTER TABLE public.whiteboard_elements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER wb_updated BEFORE UPDATE ON public.whiteboard_elements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "Participants read whiteboard" ON public.whiteboard_elements FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants write whiteboard" ON public.whiteboard_elements FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants update whiteboard" ON public.whiteboard_elements FOR UPDATE TO authenticated USING (public.is_session_participant(session_id, auth.uid())) WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants delete whiteboard" ON public.whiteboard_elements FOR DELETE TO authenticated USING (public.is_session_participant(session_id, auth.uid()));

-- ===== ARTIFACTS =====
CREATE TABLE public.generated_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_artifacts TO authenticated;
GRANT ALL ON public.generated_artifacts TO service_role;
ALTER TABLE public.generated_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read artifacts" ON public.generated_artifacts FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants write artifacts" ON public.generated_artifacts FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants update artifacts" ON public.generated_artifacts FOR UPDATE TO authenticated USING (public.is_session_participant(session_id, auth.uid())) WITH CHECK (public.is_session_participant(session_id, auth.uid()));

-- ===== POLLS =====
CREATE TABLE public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.polls TO authenticated;
GRANT ALL ON public.polls TO service_role;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read polls" ON public.polls FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants create polls" ON public.polls FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Participants update polls" ON public.polls FOR UPDATE TO authenticated USING (public.is_session_participant(session_id, auth.uid())) WITH CHECK (public.is_session_participant(session_id, auth.uid()));

-- ===== VOTES =====
CREATE TABLE public.vote_responses (
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vote_responses TO authenticated;
GRANT ALL ON public.vote_responses TO service_role;
ALTER TABLE public.vote_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read votes for poll" ON public.vote_responses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND public.is_session_participant(p.session_id, auth.uid()))
);
CREATE POLICY "Vote as self" ON public.vote_responses FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND public.is_session_participant(p.session_id, auth.uid()))
);
CREATE POLICY "Change own vote" ON public.vote_responses FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own vote" ON public.vote_responses FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ===== ACTION ITEMS =====
CREATE TABLE public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_date DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
GRANT ALL ON public.action_items TO service_role;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER ai_updated BEFORE UPDATE ON public.action_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "Participants read action items" ON public.action_items FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants write action items" ON public.action_items FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants update action items" ON public.action_items FOR UPDATE TO authenticated USING (public.is_session_participant(session_id, auth.uid())) WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants delete action items" ON public.action_items FOR DELETE TO authenticated USING (public.is_session_participant(session_id, auth.uid()));

-- ===== UPLOADS =====
CREATE TABLE public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  external_link TEXT,
  type TEXT NOT NULL DEFAULT 'file' CHECK (type IN ('file','link','past_meeting')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
GRANT ALL ON public.uploads TO service_role;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read uploads" ON public.uploads FOR SELECT TO authenticated USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants create uploads" ON public.uploads FOR INSERT TO authenticated WITH CHECK (public.is_session_participant(session_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Creator deletes uploads" ON public.uploads FOR DELETE TO authenticated USING (created_by = auth.uid());

-- ===== Realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_elements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vote_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.whiteboard_elements REPLICA IDENTITY FULL;
ALTER TABLE public.polls REPLICA IDENTITY FULL;
ALTER TABLE public.vote_responses REPLICA IDENTITY FULL;
ALTER TABLE public.action_items REPLICA IDENTITY FULL;
ALTER TABLE public.session_participants REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
