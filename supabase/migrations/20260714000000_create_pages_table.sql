-- Atlas Page Repository — canonical page storage table.
-- Idempotent: safe to run more than once against the same database.

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  url text not null,
  canonical_url text,
  title text,
  meta_description text,
  language text,
  status_code integer,
  content_type text,
  h1 text,
  word_count integer,
  crawl_status text not null default 'discovered',
  seo_status text not null default 'pending',
  content_status text not null default 'none',
  last_crawled_at timestamptz,
  last_modified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint pages_crawl_status_check check (crawl_status in ('discovered', 'queued', 'crawled', 'failed')),
  constraint pages_seo_status_check check (seo_status in ('pending', 'analyzed', 'optimized')),
  constraint pages_content_status_check check (content_status in ('none', 'generated', 'published'))
);

-- One row per (business, url) — createPage()'s "insert, or return the
-- existing page if one already exists for this business+url" semantics
-- rely on this constraint existing.
create unique index if not exists pages_business_id_url_key on public.pages (business_id, url);

create index if not exists pages_business_id_idx on public.pages (business_id);
create index if not exists pages_business_id_crawl_status_idx on public.pages (business_id, crawl_status);
create index if not exists pages_business_id_seo_status_idx on public.pages (business_id, seo_status);
create index if not exists pages_business_id_content_status_idx on public.pages (business_id, content_status);

-- Trigram indexes so searchPages()'s ILIKE search over url/title/
-- meta_description stays reasonably fast as the table grows.
create extension if not exists pg_trgm;
create index if not exists pages_url_trgm_idx on public.pages using gin (url gin_trgm_ops);
create index if not exists pages_title_trgm_idx on public.pages using gin (title gin_trgm_ops);
create index if not exists pages_meta_description_trgm_idx on public.pages using gin (meta_description gin_trgm_ops);

alter table public.pages enable row level security;

-- TODO(verify): this policy is a best-effort placeholder, not a verified
-- fact about your schema. Business Service itself has no real Supabase
-- table yet either (see src/lib/business-service.ts's own
-- TODO(supabase) markers) — there is nothing in this repository to
-- confirm a `businesses` table's actual shape, or how organization
-- membership is checked in your auth model. Adjust the subquery below
-- (and `auth.jwt() ->> 'organization_id'`, which assumes a custom JWT
-- claim that may not exist in your project) once Business Service's own
-- migration exists and your auth model is confirmed.
do $$
begin
  create policy pages_business_scoped on public.pages
    for all
    using (
      business_id in (
        select id from public.businesses where organization_id = (auth.jwt() ->> 'organization_id')::uuid
      )
    );
exception when duplicate_object then null;
end $$;
