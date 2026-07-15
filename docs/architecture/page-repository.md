# Atlas Page Repository

## Purpose

The Page Repository is Atlas's canonical page storage layer. Every
department reads pages from here — the Crawl Engine writes them, and
every future SEO-adjacent module (SEO Audit, Keyword, Content,
Competitor, Analytics) is expected to read from here rather than from
the Crawl Engine directly. No business logic lives in this file; every
method is a thin, direct mapping onto one Supabase table.

## Responsibilities

- Store and retrieve `Page` records: on-page facts (title, meta
  description, canonical URL, language, status code, word count, etc.)
  plus three independent status fields (`crawlStatus`, `seoStatus`,
  `contentStatus`) so multiple departments can track their own progress
  against the same underlying page without stepping on each other.
- Support filtered listing (`listPages`) and free-text search across
  url/title/meta description (`searchPages`).
- Provide dedicated lifecycle methods (`markCrawled`, `markSeoAnalyzed`,
  `markPublished`) rather than requiring every caller to construct its
  own status-transition update payload.
- Guarantee every query is scoped to a single business — there is no
  method in this file that reads or writes a row without a `business_id`
  filter.

## Query Model

Every method maps directly onto Supabase's PostgREST query builder
against one table, `pages`:

| Method | Query shape |
|---|---|
| `createPage` | `insert(...).select().single()` — falls back to `getPageByUrl()` on a unique-constraint conflict (see Persistence below) |
| `getPage` | `select("*").eq("id", ...).eq("business_id", ...).maybeSingle()` |
| `getPageByUrl` | `select("*").eq("url", ...).eq("business_id", ...).maybeSingle()` |
| `listPages` | `select("*").eq("business_id", ...)[.eq(status filters)...].order("created_at", { ascending: false })` |
| `searchPages` | same as `listPages`, plus `.or(url/title/meta_description ILIKE)` |
| `updatePage` / `markCrawled` / `markSeoAnalyzed` / `markPublished` | `update(...).eq("id", ...).eq("business_id", ...).select().single()` |
| `deletePage` | `delete().eq("id", ...).eq("business_id", ...)` |

A small set of reusable helpers back every method, so no query is
constructed twice: `mapRowToPage()` (row → `Page`), `contentFieldsToRow()`
(the ten mutable content fields → their column names, including only
keys actually present so a partial update never clobbers an unrelated
column), `applyStatusFilters()` (shared by `listPages`/`searchPages`),
and `buildSearchOrFilter()` (constructs and correctly escapes the
multi-column ILIKE `.or()` filter — both SQL wildcard characters in the
search term and PostgREST's own filter-string quoting rules are handled
explicitly, not left to chance).

## Persistence

Backed by exactly one table, `public.pages` (see
`supabase/migrations/20260714000000_create_pages_table.sql`), via
Atlas's one canonical Supabase client
(`src/integrations/supabase/client.ts` — this file creates no client of
its own).

`createPage()`'s upsert behavior is deliberately **not** a normal
Supabase `.upsert()` call: per spec, if a page already exists for a
given `business_id` + `url` (enforced by a unique index,
`pages_business_id_url_key`), the *existing* row is returned rather than
being overwritten. This is implemented by attempting a plain `insert()`
and, specifically on a Postgres `23505` (unique_violation) error, falling
back to `getPageByUrl()` — any other error still propagates normally.

**Error handling:** never throws for "no rows found" — that's a normal,
expected outcome (`getPage`/`getPageByUrl` return `null`;
`listPages`/`searchPages` return `[]`). It does throw, with a message
identifying which method failed, for a genuine Supabase error (a real
query/connection/permission failure) — "only throw for genuine
persistence failures," never for the simple absence of data.

**Verification note:** this sandboxed environment has no network access
to any real Supabase project and cannot install `@supabase/supabase-js`
(the npm registry is unreachable here). The implementation was verified
two ways instead: strict TypeScript checking against a local stub
matching the real library's API surface, and real behavioral tests
(insert, upsert-on-conflict, update, status filters, multi-column ILIKE
search including special characters, delete, and field-protection on
`updatePage`) run against an in-memory fake client implementing the same
query-builder interface. This is **not** the same as a real Supabase
integration test — a genuine end-to-end smoke test against your actual
Supabase project (after applying the migration) is recommended once this
is deployed.

## Business Scoping

Every single method takes `businessId` as a parameter, and every
Supabase call includes `.eq("business_id", businessId)` — there is no
code path in this file that can read or write a page belonging to a
different business, matching Atlas's multi-business architecture
(`docs/architecture/atlas-kernel.md`'s Business DNA section).

## Status Lifecycle

Three independent status fields track three independent concerns:

- **`crawlStatus`**: `discovered` → `queued` → `crawled` (or `failed`).
  Set to `discovered` by `createPage()`; set to `crawled` (with
  `lastCrawledAt` stamped) by `markCrawled()`.
- **`seoStatus`**: `pending` → `analyzed` → `optimized`. Set to `pending`
  by `createPage()`; set to `analyzed` by `markSeoAnalyzed()` (intended
  caller: a future SEO Audit Engine).
- **`contentStatus`**: `none` → `generated` → `published`. Set to `none`
  by `createPage()`; set to `published` by `markPublished()` (intended
  caller: a future Content/Publishing Engine).

These three are deliberately independent — a page can be `crawled`,
`analyzed`, and still `none` for content, all at once — since different
departments progress a page through their own concerns on their own
schedule.

## Future Versioning

None of the following exist yet; each has a clear seam in the current
schema:

- **Page versioning / historical snapshots.** The current schema stores
  only the latest crawl's data per page. A future revision could add a
  `page_versions` table (one row per historical crawl of a given page,
  keyed by `page_id` + `crawled_at`) without changing `pages` itself —
  `markCrawled()` would additionally insert into that table.
- **Soft delete.** `deletePage()` currently performs a hard `DELETE`. A
  future revision could add a `deleted_at` column and change
  `deletePage()` to set it instead of removing the row, with
  `listPages()`/`searchPages()`/`getPage()` filtering `deleted_at IS
  NULL` by default — a schema-additive change, not a rewrite of this
  file's public API.
- **Incremental crawling.** `lastCrawledAt` already exists specifically
  so a future Crawl Engine revision can compare it (or a `Last-Modified`/
  `ETag` check) against the current time to decide whether a page needs
  re-crawling at all, rather than always re-crawling everything.
