
CREATE TYPE public.relationship_type AS ENUM ('parent', 'child', 'related', 'supports');

CREATE TABLE public.topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO authenticated;
GRANT ALL ON public.topics TO service_role;

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own topics" ON public.topics
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_topics_project ON public.topics(project_id);

CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.topic_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  target_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  relationship_type public.relationship_type NOT NULL DEFAULT 'related',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topic_rel_no_self CHECK (source_topic_id <> target_topic_id),
  CONSTRAINT topic_rel_unique UNIQUE (source_topic_id, target_topic_id, relationship_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_relationships TO authenticated;
GRANT ALL ON public.topic_relationships TO service_role;

ALTER TABLE public.topic_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own topic_relationships" ON public.topic_relationships
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_topic_rel_project ON public.topic_relationships(project_id);
CREATE INDEX idx_topic_rel_source ON public.topic_relationships(source_topic_id);
CREATE INDEX idx_topic_rel_target ON public.topic_relationships(target_topic_id);

CREATE TRIGGER update_topic_relationships_updated_at
  BEFORE UPDATE ON public.topic_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
