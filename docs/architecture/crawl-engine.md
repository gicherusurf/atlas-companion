# Atlas Crawl Engine

## Purpose

The Crawl Engine discovers every page belonging to a business's website
and extracts basic page information. It is responsible for **crawling**
— resolving where a business's pages live, downloading them, and finding
what they link to. It is **not** responsible for SEO analysis; that's a
separate, future consumer of the pages this engine discovers and Page
Repository stores.

This document covers the production implementation — every method
previously documented with a `TODO(crawler)` placeholder is now fully
implemented, with the same public API and same file
(`src/lib/crawl-service.ts`) as before.

## Architecture

The Crawl Engine is deliberately thin — it reuses four existing Atlas
modules rather than reimplementing what any of them already do:

| Concern | Reused module | What it provides |
|---|---|---|
| Which business, which website | `businessService` | `getBusiness()` |
| URL normalization, redirect resolution, robots.txt/sitemap.xml fallback | `websiteDiscoveryService` | `discoverWebsite()`, `discoverSitemap()` |
| On-page metadata extraction | `metadataExtractor` | `extractMetadata()` |
| All persistence | `pageService` | `createPage`, `updatePage`, `markCrawled`, `getPageByUrl`, `getPage`, `listPages`, `deletePage` |
| All HTTP requests | `atlasHttp` | `get()` — timing, timeout, error normalization |

**One narrow, deliberate exception:** discovering a page's *list* of
outbound links requires reading `<a href>` values, and Metadata
Extractor's public API only exposes *counts*
(`countInternalLinks`/`countExternalLinks`), not the URLs themselves —
no existing Atlas module returns a page's raw link list. `crawl-service.ts`'s
own `extractLinksFromHtml()` fills that specific gap. This is a different
concern from Metadata Extractor's job (on-page SEO metadata vs. crawl
discovery), not a duplication of it.

**Persistence reality:** `pageService` itself has no real persistence yet
— every write method it exposes still throws `TODO(supabase)`, and every
read method still returns empty/`null`. Every persistence call this
engine makes is real, correct production logic that will simply start
working the moment Page Repository's Supabase layer lands — nothing here
needs to change when that happens. Where a persistence attempt is
incidental to a method's main job (`crawlPage()` trying to save what it
found), failures are caught so they don't erase otherwise-successful
crawl work. Where persistence IS the method's entire job (`savePage`,
`deletePage`), failures propagate, matching every other Atlas service's
"write methods throw" convention.

## Discovery Flow

```
startCrawl({ businessId, seedUrl? })
        │
        ▼
  businessService.getBusiness(businessId)      <- Lookup business
        │
        ▼
  websiteDiscoveryService.discoverWebsite()     <- Resolve website
   (reused: normalization + redirect resolution)
        │
        ▼
  websiteDiscoveryService.discoverSitemap()     <- Seed queue
   (reused: robots.txt Sitemap: lines, else
    /sitemap.xml — already implemented there)
        │
        ▼
  pageService.createPage() per seed URL          <- Persist as "pending"
        │
        ▼
     CrawlJob { status: "queued" }
```

```
crawlPage(businessId, url)
        │
        ▼
   atlasHttp.get(url)                <- Download HTML (never raw fetch())
        │
        ▼
  metadataExtractor.extractMetadata() <- No manual HTML parsing
        │
        ├──▶ extractLinksFromHtml()   <- Discover outbound links
        │        (same HTML, no second download)
        │
        ▼
  pageService.markCrawled()          <- Persist (best-effort)
        │
        ▼
     CrawlPage { crawlStatus: "crawled" | "failed" }
```

## Link Resolution

Every `<a href>` on a page goes through `normalizeDiscoveredUrl()`:

1. `mailto:`, `tel:`, and `javascript:` hrefs are excluded entirely —
   neither internal nor external, never queued.
2. The href is resolved against the page's own URL into an absolute URL
   (`new URL(href, pageUrl)`).
3. Its fragment (`#section`) is stripped — a fragment identifies a
   location *within* a page, not a different page to crawl, so `/about`
   and `/about#team` resolve to the same discovered URL.
4. `shouldQueueLink()` keeps only same-origin URLs, per "only keep pages
   belonging to the same origin."
5. Results are de-duplicated via a `Set`.

`discoverLinks()` additionally filters out URLs Page Repository already
knows about for the business (currently a no-op, since `pageService` has
no persistence yet, but real, correct logic).

**Verified behaviors** (see Performance below for how): relative URLs
resolve correctly, duplicate links (including a fragment-only variant of
an already-seen URL) collapse to one entry, external-origin links are
excluded, `mailto:`/`tel:`/`javascript:` links are excluded, and a link
to a page that will later 404 is still discovered — discovery and
successful crawling are different questions.

## Queue Model

This implementation is entirely **synchronous** — there is no background
worker, no persisted job queue, and no polling. "Seeding the queue"
(`startCrawl()`) means attempting to persist each discovered URL as a
`Page` with a pending crawl status via `pageService`. A caller is
expected to retrieve that queue via the existing `listPages()` method and
drive further crawling by calling `crawlPage()` once per URL itself.

`CrawlJob` (this file's own, simpler type) is intentionally a separate
concept from `Job` (`src/types/job.ts`) for now. **Future:** the Crawl
Engine is expected to eventually create/update a real `Job` via
`jobManager` to track a crawl run — with `Job.progress`/`currentStage`
replacing `CrawlJob`'s counters — and to publish
discovery/completion events via the Event Bus. Neither integration is
wired up yet; this file has no import of `job-manager.ts` or
`event-bus.ts`, by design, until that work is explicitly scoped. Real
queue processing — concurrency, retry, prioritization, depth-accurate BFS
tracking across an entire crawl (this implementation only approximates
depth for links discovered via `crawlPage()`, since that method's public
signature carries no depth parameter of its own) — is expected to live in
that future Job Manager/Workflow Engine integration, not here.

## Error Handling

Every method that performs I/O is designed to never throw for an
*expected* failure (network error, timeout, 404, CORS rejection,
malformed HTML) — it returns a structured result instead:

- `crawlPage()` on an unreachable host, a 404, or malformed HTML all
  return a normal `CrawlPage` — `crawlStatus: "failed"` for the first
  two, `crawlStatus: "crawled"` for the last (a browser's `DOMParser`
  never throws on malformed markup, so a "malformed" page still crawls
  successfully; it just may extract less metadata).
- `discoverLinks()` returns `[]` rather than throwing on a network
  failure.
- `startCrawl()` returns a `CrawlJob` with `status: "failed"` (never
  throws) if the business doesn't exist or no website can be resolved.
- `savePage()` and `deletePage()` are the exception: since their entire
  purpose IS persistence, a `pageService` failure propagates rather than
  being swallowed — silently hiding a persistence failure from a caller
  whose only job was to persist something would be worse than letting it
  surface.

One failed page never terminates a crawl — `crawlPage()` is designed to
be called once per URL, independently, by whatever drives the queue.

## Performance

- `atlasHttp`'s `HttpResponse.durationMs` is reused directly for crawl
  timing — no separate timing logic exists in this file.
- `extractLinksFromHtml()` is a private core function shared by both
  `discoverLinks()` (which downloads its own HTML) and `crawlPage()`
  (which already has HTML in hand from its own download). `crawlPage()`
  calls this core function **directly**, not via the public
  `discoverLinks()` method, specifically to avoid downloading the same
  page twice.
- `startCrawl()` reuses `websiteDiscoveryService.discoverSitemap()`
  rather than re-parsing robots.txt/sitemap.xml itself — one fewer place
  that logic could drift out of sync.

**Verified concretely, not just asserted:** this implementation was
compiled and run against a real local HTTP server through a real
Chromium browser (via Playwright) — no mocked DOM, no mocked `fetch`.
The one piece of Atlas with genuinely no backing store to test against
(`businessService.getBusiness`, and `pageService`'s persistence methods)
was stubbed with an in-memory equivalent for the test only; every other
call — `websiteDiscoveryService.discoverWebsite()`,
`discoverSitemap()` fetching a real `robots.txt` and `sitemap.xml`,
`metadataExtractor.extractMetadata()`, `atlasHttp.get()` — ran for real
against the fixture server. 35 assertions covered relative URLs,
redirects (confirming the *final* redirected-to URL and its title are
what's recorded), 404 pages, duplicate links, fragment links, external
links, and malformed HTML — all passing.

## Future Distributed Crawling

None of the following exist yet; this implementation is a single-process,
synchronous, in-memory-only crawler by design, with clear seams for each:

- **Supabase.** The moment Page Repository's Supabase layer lands, every
  `pageService` call this file already makes — no changes needed here —
  starts actually persisting and querying real data.
- **Redis (or an equivalent queue).** "Seeding the queue" today just
  means creating `Page` rows with a pending status; a real queue would
  let multiple workers claim and process pages concurrently rather than
  one caller looping over `listPages()` sequentially.
- **Distributed workers.** `crawlPage()`'s signature
  (`businessId, url`) is already worker-friendly — nothing about it
  assumes a single process; a pool of workers could each pull URLs from
  a real queue and call this same method.
- **Incremental crawling.** Re-crawling a business's site today means
  starting over; a future revision could compare `Page.lastCrawledAt` (or
  a `Last-Modified`/`ETag` check via `atlasHttp`) to skip pages that
  haven't changed, rather than re-downloading everything every time.
- **Job Manager / Event Bus integration**, per the Queue Model section
  above — tracking a crawl run as a real `Job`, and publishing
  discovery/completion events other modules could react to.
