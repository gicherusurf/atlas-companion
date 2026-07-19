-- Atlas Knowledge Graph Engine — entity/relationship storage tables.
-- Idempotent: safe to run more than once against the same database.

create table if not exists public.knowledge_entities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  type text not null,
  name text not null,
  normalized_name text not null,
  description text,
  source_page_id uuid,
  confidence numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint knowledge_entities_confidence_check check (confidence >= 0 and confidence <= 1)
);

create index if not exists knowledge_entities_business_id_idx on public.knowledge_entities (business_id);
create index if not exists knowledge_entities_business_id_type_idx on public.knowledge_entities (business_id, type);
-- Backs mergeEntities()'s dedup lookup (same business, same type, same normalized name).
create index if not exists knowledge_entities_dedup_idx on public.knowledge_entities (business_id, type, normalized_name);

create table if not exists public.knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  source_entity_id uuid not null references public.knowledge_entities (id) on delete cascade,
  target_entity_id uuid not null references public.knowledge_entities (id) on delete cascade,
  relationship text not null,
  confidence numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint knowledge_relationships_confidence_check check (confidence >= 0 and confidence <= 1)
);

-- One row per distinct (source, target, relationship) edge — this is what
-- lets confidence be BOOSTED (rather than duplicated) when multiple pages
-- independently support the same relationship. See
-- `upsertRelationship()` in `knowledge-graph.ts`.
create unique index if not exists knowledge_relationships_unique_edge
  on public.knowledge_relationships (business_id, source_entity_id, target_entity_id, relationship);

create index if not exists knowledge_relationships_business_id_idx on public.knowledge_relationships (business_id);

alter table public.knowledge_entities enable row level security;
alter table public.knowledge_relationships enable row level security;

-- TODO(verify): same placeholder caveat as Page Repository's migration —
-- Business Service has no real `businesses` table yet to verify this
-- against; adjust once it exists and your auth model is confirmed.
do $$
begin
  create policy knowledge_entities_business_scoped on public.knowledge_entities
    for all
    using (
      business_id in (
        select id from public.businesses where organization_id = (auth.jwt() ->> 'organization_id')::uuid
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy knowledge_relationships_business_scoped on public.knowledge_relationships
    for all
    using (
      business_id in (
        select id from public.businesses where organization_id = (auth.jwt() ->> 'organization_id')::uuid
      )
    );
exception when duplicate_object then null;
end $$;
