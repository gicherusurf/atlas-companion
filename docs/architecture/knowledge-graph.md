# Atlas Knowledge Graph Engine

## Purpose

The Knowledge Graph Engine transforms structured page metadata into
business knowledge — entities and the relationships between them. It
does **not** perform SEO analysis and does **not** generate
recommendations; it only builds knowledge. It is entirely deterministic:
rules, regexes, and structural co-occurrence only — no AI/LLM calls
anywhere in this file.

This document covers the production implementation — every method
previously documented with a `TODO(knowledge-engine)` placeholder is now
fully implemented, with the same public API and same file
(`src/lib/knowledge-graph.ts`) as before.

## Architecture

Reuses, rather than duplicates:

- **Page Repository** (`pageService`) — `buildKnowledgeGraph()`'s source
  of pages for a business. This file never crawls or fetches HTML
  itself.
- **Metadata Extractor's output type** (`ExtractedMetadata`) — consumed
  as input; this file never parses HTML.
- **Atlas's one canonical Supabase client**
  (`src/lib/infrastructure/supabase.ts`) — entities and relationships are
  persisted to two new tables (see
  `supabase/migrations/20260714010000_create_knowledge_graph_tables.sql`).
  No second client was created.
- Rule Engine and Event Bus are reused **in name only**, per the brief —
  "future only." This file has no import of either yet.

**A real, honest architectural limitation, stated plainly:** `Page`
(what Page Repository persists) is a flattened subset of
`ExtractedMetadata` — it has no `headings[]` beyond a single `h1`, no
`openGraph`/`twitterCard` objects, and no `structuredData[]`.
`buildKnowledgeGraph()` reconstructs a page's metadata from Page
Repository alone (`pageToMinimalExtractedMetadata()`), so it can only
realistically extract from title/metaDescription/h1/canonicalUrl for
pages processed this way — the richest signals (JSON-LD, Open Graph,
Twitter Card) are unavailable through that path today. `extractEntities()`
itself has no such limitation: a caller with real `ExtractedMetadata` in
hand — e.g. a future Crawl Engine step calling this immediately after
`metadataExtractor.extractMetadata()`, before that richer data is
discarded — gets full extraction. This is a genuine gap worth closing
(either by having Page Repository store richer metadata, or by wiring
Crawl Engine to call this engine directly at crawl time), not a hidden
shortcut.

## Entity Extraction

`extractEntities(businessId, page, metadata)` runs each of the following
sources independently, catching errors per-source so one malformed input
never prevents the others from running:

| Source | Confidence | Produces |
|---|---|---|
| JSON-LD | 0.98 | Organization, Product, Service, Person, Brand, Document (Article/FAQ/BlogPosting/WebPage), plus nested Phone/Email/City/Country on an Organization, plus Keyword (from BreadcrumbList) |
| Open Graph | 0.95 | Organization (`og:site_name`), Product (`og:type: "product"` + `og:title`) |
| Twitter Card | 0.95 | SocialProfile (`twitter:site`, `twitter:creator`) |
| Title | 0.85 | Email/Phone found via regex within the `<title>` text |
| Heading | 0.75 | Email/Phone found via regex within each heading's text |
| Meta description | 0.70 | Email/Phone found via regex within the meta description |
| Canonical URL domain (fallback) | 0.60 | Organization, named from the domain — **only** when no other Organization was already found |

**"Use the existing enum," honored literally:** `KnowledgeEntityType` is
unmodified — 18 values, unchanged. This brief's entity vocabulary
(Website, Category, Article, FAQ, Breadcrumb) doesn't map 1:1 onto that
enum; each is mapped onto the closest existing type instead of inventing
a new one:

| Brief's concept | Mapped to | Why |
|---|---|---|
| Website | *(not created as a distinct entity)* | No existing type fits; a URL is used as extraction *input* (domain-fallback Organization), never as its own entity |
| Category | `Keyword` | Breadcrumb crumbs are short topical labels — the same shape as a keyword |
| Article / FAQ | `Document` | Both are page-level content assets; `Document` is the closest existing generic type |
| Breadcrumb | `Keyword` (per item) | Same reasoning as Category — see `extractBreadcrumbEntities()` |

Every helper the brief suggested by name exists: `normalizeEntityName()`,
`extractEmails()`, `extractPhones()`, `extractUrls()`, `mergeMetadata()`,
plus the JSON-LD-specific `extractOrganizationContactEntities()` and
`extractBreadcrumbEntities()`.

## Relationship Inference

`extractRelationships()` infers relationships purely from which entity
**types** co-occurred on a single page (`inferRelationshipsForPage()`) —
deterministic structural co-occurrence, no NLP:

- Organization → **offers** → Service
- Organization → **located_in** → Location/City/Country
- Brand → **owns** → Product (or Organization → **owns** → Product, if no
  Brand entity is present)
- Document → **mentions** → Product
- Product → **belongs_to** → Keyword (the breadcrumb-derived stand-in for
  "Category")
- Organization → **related_to** → Email / Phone / SocialProfile — the
  existing `RelationshipType` enum has no more specific verb for "this is
  the organization's own contact info," so `related_to` is the honest,
  documented generic fit rather than inventing a new relationship type.

All relationship type values used are the **existing** `RelationshipType`
enum values (`offers`, `located_in`, `owns`, `mentions`, `belongs_to`,
`related_to`) — no enum changes here either.

## Confidence Model

Entity confidence follows the table in "Entity Extraction" above — more
structured, less ambiguous sources score higher. `CONFIDENCE.body`
(0.60) is reserved for the weakest deterministic signal this engine
produces (the canonical-URL-domain fallback), since Metadata Extractor's
output has no raw page-body text field to extract from — there is no
literal "body text" tier to apply this to, so it's applied to the
next-weakest available signal instead, documented explicitly in
`knowledge-graph.ts`'s own `CONFIDENCE.body` comment.

Relationship confidence is calculated independently of entity confidence,
starting at a baseline of **0.65** per page (a single page's co-occurrence
is a real but not certain signal). It genuinely increases when multiple
pages agree: `upsertRelationship()` — used by `buildKnowledgeGraph()` —
looks for an existing edge with the same (source, target, relationship
type); if found, it boosts confidence by `+0.05` (capped at `1.0`) instead
of creating a duplicate row. This was verified concretely: a real test
constructed two pages independently supporting "Organization offers
Service," confirmed exactly one persisted edge (not two), and confirmed
its confidence rose from `0.65` to `0.70`.

## Deduplication

`mergeEntities()` compares each candidate against a business's existing
persisted entities of the **same type**, matching on:

- Normalized name equality (`normalizeEntityName()` — lowercased,
  diacritics/punctuation stripped, whitespace collapsed), for any type; or
- Exact value equality, for `Email`/`Phone` entities specifically; or
- A matching `metadata.domain` value, for entities that carry one (e.g.
  the canonical-URL-domain fallback Organization).

On a match: the **higher-confidence** candidate's `name`/`description`
win, `confidence` becomes `max(existing, new)`, and `metadata` is unioned
via `mergeMetadata()` — which specifically concatenates+dedupes
array-valued keys present on both sides (`sourcePageIds`), so an entity
found on multiple pages accumulates all of them rather than losing all
but the most recent. On no match: the candidate is inserted as new. This
was verified concretely: the same organization, submitted twice with
different casing/whitespace, a lower confidence, and a different source
page, resulted in exactly one stored row — with the higher confidence
kept and both page references present in `metadata.sourcePageIds`.

## Future AI Enrichment

None of the following exist yet; the current implementation is
deliberately, entirely deterministic (a hard requirement for this
sprint) with clear seams for each:

- **LLMs / NER models.** Today's entity extraction is regex- and
  structure-based (JSON-LD, Open Graph, Twitter Card, plain-text
  email/phone patterns). A future NER model or LLM pass could identify
  entities this engine currently misses entirely (e.g. Person names
  mentioned in body copy, Technology mentions, nuanced Product naming)
  and would plug in as an additional source function alongside
  `extractFromJsonLd`/`extractFromOpenGraph`/etc. in `extractEntities()`
  — same output shape (`KnowledgeEntity[]`), same confidence-tagging
  discipline, likely its own new confidence tier below `jsonLd` but
  above the deterministic-regex tiers, reflecting model uncertainty.
- **Vector embeddings.** Would enable fuzzy entity matching in
  `mergeEntities()` (e.g. recognizing "Acme Corp" and "Acme
  Corporation" as the same entity) beyond today's exact-normalized-name
  matching — a similarity threshold check alongside the existing exact
  matches in `findMergeCandidate()`, not a replacement for them.
- **Graph databases.** Entities/relationships are stored in two
  relational tables today (`knowledge_entities`/
  `knowledge_relationships`), queried via simple filters. A dedicated
  graph database would primarily change how `findEntities`/
  `findRelationships`/traversal queries are executed internally — the
  public `KnowledgeGraph`/`KnowledgeEntity`/`KnowledgeRelationship` shapes
  this file already returns wouldn't need to change.
- **Entity resolution.** A more sophisticated successor to today's
  exact-match `mergeEntities()` — cross-referencing external identifiers,
  fuzzy name matching, and confidence-weighted conflict resolution across
  many more signals than name/email/phone/domain.
- **Knowledge enrichment.** Augmenting extracted entities with external
  data (e.g. enriching a Location entity with coordinates, or a
  Technology entity with a canonical description) — a distinct,
  additive step that would run after extraction/merge, not replace them.

## Verification note

This sandboxed environment has no network access to any real Supabase
project and cannot install `@supabase/supabase-js`. As with Page
Repository, this implementation was verified via strict TypeScript
checking against a local API stub, and via real behavioral tests (40
assertions) against an in-memory fake Supabase client — covering
Organization/Product/Service/Phone/Email/City/Country/Keyword extraction
from JSON-LD, Open Graph, and plain text; relationship inference and its
baseline confidence; deduplication (including cross-page merge with
metadata union); `findEntity`/`findEntities`/`findRelationships` against
the fake store (type, name-search, and confidence-threshold filters); a
full `buildKnowledgeGraph()` run across two pages; and — specifically —
confirmation that relationship confidence rises from 0.65 to 0.70 when a
second page independently supports the same relationship. This is
**not** the same as a real Supabase integration test; a genuine
end-to-end smoke test against your actual Supabase project, after
applying the migration, is recommended once this is deployed.
