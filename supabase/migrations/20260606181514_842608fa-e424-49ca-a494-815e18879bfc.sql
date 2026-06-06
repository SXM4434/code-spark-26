
ALTER TABLE public.generated_artifacts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS ga_updated ON public.generated_artifacts;
CREATE TRIGGER ga_updated BEFORE UPDATE ON public.generated_artifacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_artifacts;
