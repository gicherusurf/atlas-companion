import { businessService } from "@/lib/business-service";
import { websiteDiscoveryService } from "@/lib/website-discovery-service";
import { metadataExtractor } from "@/lib/metadata-extractor";
import { pageService } from "@/lib/page-service";
import { atlasHttp } from "@/lib/http-client";
import type { HttpResponse } from "@/types/http";
import type { ExtractedMetadata } from "@/types/metadata";
import type { Page, PageStatus } from "@/types/page";
import type {
  CrawlJob,
  StartCrawlInput,
  CrawlPage,
  CrawlPageInput,
  CrawlPageStatus,
  CrawlDiscoverySource,
} from "@/types/crawl";

// Atlas Crawl Engine — production implementation.
//
// Discovers every page belonging to a business's website and extracts
// basic page information (title, meta description, language, status code,
// etc). It does NOT perform SEO analysis — that's a separate, future
// consumer of the pages this engine discovers.
//
// REUSE, NOT DUPLICATION — this file deliberately delegates to modules
// that already exist rather than reimplementing what they do:
//   - `businessService` — resolving which business/website a crawl is for
//   - `websiteDiscoveryService` — URL normalization/redirect resolution
//     (`discoverWebsite`) and the robots.txt-then-/sitemap.xml fallback
//     chain (`discoverSitemap`) that seeds a crawl's starting queue
//   - `metadataExtractor` — all on-page metadata extraction; this file
//     never parses HTML for title/description/canonical/etc. itself
//   - `pageService` — all persistence; this file never talks to Supabase
//     directly, and never duplicates Page Repository's storage logic
//   - `atlasHttp` — all HTTP requests; this file never calls `fetch()`
//     directly, per the Atlas HTTP Client's "no module should call
//     fetch() directly once migrated" goal
//
// One narrow exception: discovering the *list* of outbound links on a
// page (as opposed to the metadata Metadata Extractor already provides)
// requires reading `<a href>` values, and Metadata Extractor's public API
// only exposes *counts* (`countInternalLinks`/`countExternalLinks`), not
// the URLs themselves — there is no existing Atlas module that returns a
// page's raw link list. This file's `extractLinksFromHtml()` fills that
// specific, narrow gap; see its own comment for why this isn't
// "duplicating Metadata Extractor."
//
// PERSISTENCE REALITY: `pageService` itself has no real persistence yet —
// its own TODO(supabase) markers mean `createPage`/`updatePage`/
// `markCrawled`/`deletePage` all currently throw, and `getPage`/
// `listPages`/`getPageByUrl` currently return empty/null. Every
// persistence call this file makes is real, correct, production logic —
// it will start actually working the moment Page Repository's Supabase
// layer lands, with zero changes needed here. Where a persistence
// attempt is incidental to a method's main job (e.g. `crawlPage()`
// trying to save what it found), failures are caught so they don't erase
// otherwise-successful work; where persistence IS the method's entire
// job (`savePage`, `deletePage`), failures propagate, matching every
// other Atlas service's "write methods throw" convention.
//
// FUTURE: `CrawlJob` (this file) is intentionally a separate, simpler
// concept from `Job` (`src/types/job.ts`) for now. The Crawl Engine is
// expected to eventually create/update a real `Job` via `jobManager` to
// track a crawl run — with `Job.progress`/`currentStage` replacing
// `CrawlJob`'s counters, and `Job.status` replacing `CrawlJobStatus` —
// but that wiring isn't in place yet; this file has no import of
// `job-manager.ts`, by design, until that integration is explicitly
// scoped. Likewise, a future `eventBus` integration would publish
// page-discovered/crawl-completed events; not wired up yet either.
//
// QUEUE MODEL: this implementation is entirely synchronous — there is no
// background worker, no persisted job queue, and no polling. "Seeding the
// queue" (in `startCrawl()`) means attempting to persist each discovered
// URL as a `Page` with `crawlStatus: "discovered"` (mapped from
// `CrawlPageStatus: "pending"`) via `pageService`; a caller is expected
// to retrieve that queue via the existing `listPages()` method and drive
// further crawling by calling `crawlPage()` once per URL itself. Real
// queue processing (concurrency, retry, prioritization) is expected to
// live in a future Job Manager/Workflow Engine integration, not here.

/** Generates an id for a CrawlPage/CrawlJob record, the same way `event-bus.ts` generates event ids. */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Private helpers -------------------------------------------------------

/**
 * Downloads a page's HTML via the Atlas HTTP Client (never a raw
 * `fetch()` call). Throws `HttpError` (from `atlasHttp`) on total
 * failure — every caller of this function is responsible for catching
 * that, per "never crash."
 */
async function downloadHtml(url: string): Promise<HttpResponse<string>> {
  // TODO(edge-function): same CORS caveat as Website Discovery Service —
  // Atlas runs in the browser, so an arbitrary target site without
  // permissive CORS headers is unreachable via a direct client-side
  // request. See website-discovery-service.ts's own TODO(edge-function)
  // comments for the intended fix (a server-side proxy/Edge Function);
  // this file will call that same eventual proxy, unchanged otherwise.
  return atlasHttp.get<string>(url);
}

/**
 * Whether two URLs share the same origin. Never throws — an unparseable
 * URL is treated as "not the same origin" rather than an error.
 */
function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Resolves a raw `<a href>` value against the page it was found on into
 * an absolute URL, stripping any fragment (`#section`) — a fragment
 * identifies a location *within* a page, not a different page to crawl.
 * Returns null (meaning "not a page to discover") for `mailto:`/`tel:`/
 * `javascript:` links or genuinely unparseable hrefs, never throwing.
 */
function normalizeDiscoveredUrl(href: string, pageUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(mailto|tel|javascript):/i.test(trimmed)) return null;

  try {
    const resolved = new URL(trimmed, pageUrl);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Whether a normalized, discovered URL should be added to the crawl
 * queue: same-origin only, per "Only keep pages belonging to the same
 * origin."
 */
function shouldQueueLink(discoveredUrl: string, pageUrl: string): boolean {
  return sameOrigin(discoveredUrl, pageUrl);
}

/**
 * The actual link-extraction logic: parses `html`, reads every `<a
 * href>`, normalizes and filters each one, and de-duplicates the result.
 * This is a private core function (mirroring the `*FromDoc` pattern in
 * `metadata-extractor.ts`) — both the public `discoverLinks()` (which
 * fetches its own HTML) and `crawlPage()` (which already has HTML in
 * hand from its own download) call this same function, so the logic
 * exists exactly once. `crawlPage()` deliberately calls this directly
 * rather than `discoverLinks()`, specifically to avoid downloading the
 * same page twice — see `crawlPage()`'s own comment.
 *
 * Note on scope: Metadata Extractor's `countInternalLinks`/
 * `countExternalLinks` return *counts*, not the URL list a crawler needs
 * to actually queue new pages — there is no existing Atlas module that
 * returns a page's raw outbound links, so this parsing (distinct from,
 * not a duplicate of, Metadata Extractor's on-page metadata extraction)
 * lives here.
 */
function extractLinksFromHtml(html: string, pageUrl: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const discovered = new Set<string>();

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;

    const normalized = normalizeDiscoveredUrl(href, pageUrl);
    if (!normalized) return;
    if (!shouldQueueLink(normalized, pageUrl)) return;

    discovered.add(normalized);
  });

  return Array.from(discovered);
}

const PAGE_STATUS_TO_CRAWL_STATUS: Record<PageStatus, CrawlPageStatus> = {
  discovered: "pending",
  queued: "pending",
  crawled: "crawled",
  failed: "failed",
};

/**
 * Maps a Page Repository `Page` record onto this engine's own `CrawlPage`
 * shape. `depth`/`parentUrl`/`discoveredFrom` aren't fields Page
 * Repository models natively (it's deliberately domain-neutral — see
 * `docs/architecture/page-repository.md`'s equivalent notes), so the
 * Crawl Engine stores them in `Page.metadata` and reads them back out
 * here, rather than asking Page Repository's schema to change for a
 * crawl-specific concern.
 */
function pageToCrawlPage(page: Page, crawlStatusOverride?: CrawlPageStatus): CrawlPage {
  const meta = page.metadata as {
    depth?: number;
    parentUrl?: string | null;
    discoveredFrom?: CrawlDiscoverySource;
  };

  return {
    id: page.id,
    businessId: page.businessId,
    url: page.url,
    canonicalUrl: page.canonicalUrl,
    title: page.title,
    metaDescription: page.metaDescription,
    language: page.language,
    statusCode: page.statusCode,
    lastModified: page.lastModified,
    contentType: page.contentType,
    depth: meta.depth ?? 0,
    parentUrl: meta.parentUrl ?? null,
    discoveredFrom: meta.discoveredFrom ?? "manual",
    crawlStatus: crawlStatusOverride ?? PAGE_STATUS_TO_CRAWL_STATUS[page.crawlStatus],
    discoveredAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

/**
 * Builds a CrawlPage directly from a successful crawl's extracted
 * metadata and response info — this is the return value `crawlPage()`
 * gives its caller; it is independent of whether the persistence attempt
 * (via `pageService`) succeeded, since a crawl can genuinely succeed even
 * while Page Repository has nowhere to save it yet (see the file-level
 * "PERSISTENCE REALITY" note above).
 */
function buildPageRecord(params: {
  businessId: string;
  url: string;
  extracted: ExtractedMetadata;
  statusCode: number;
  contentType: string | null;
  depth?: number;
  parentUrl?: string | null;
  discoveredFrom?: CrawlDiscoverySource;
}): CrawlPage {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    businessId: params.businessId,
    url: params.url,
    canonicalUrl: params.extracted.canonicalUrl,
    title: params.extracted.title,
    metaDescription: params.extracted.metaDescription,
    language: params.extracted.language,
    statusCode: params.statusCode,
    lastModified: params.extracted.lastModified,
    contentType: params.contentType,
    depth: params.depth ?? 0,
    parentUrl: params.parentUrl ?? null,
    discoveredFrom: params.discoveredFrom ?? "manual",
    crawlStatus: "crawled",
    discoveredAt: now,
    updatedAt: now,
  };
}

/**
 * Builds a CrawlPage representing a failed crawl attempt — used whenever
 * `crawlPage()` couldn't download or read the target page. Never thrown;
 * always returned, per "never crash — return structured failures."
 */
function buildFailedCrawlPage(
  businessId: string,
  url: string,
  discoveredAt: string,
  statusCode: number | null = null,
): CrawlPage {
  return {
    id: generateId(),
    businessId,
    url,
    canonicalUrl: null,
    title: null,
    metaDescription: null,
    language: null,
    statusCode,
    lastModified: null,
    contentType: null,
    depth: 0,
    parentUrl: null,
    discoveredFrom: "manual",
    crawlStatus: "failed",
    discoveredAt,
    updatedAt: discoveredAt,
  };
}

/**
 * Best-effort persists newly discovered links as pending pages, so a
 * future caller driving the crawl via `listPages()` sees them queued.
 * De-duplicates against pages Page Repository already knows about
 * (currently always a no-op, since `pageService.getPageByUrl` has no
 * persistence yet). Every failure is swallowed — a persistence gap here
 * must never fail the crawl of the page that discovered these links.
 */
async function queueDiscoveredLinks(businessId: string, links: string[], parentUrl: string): Promise<void> {
  for (const link of links) {
    try {
      const existing = await pageService.getPageByUrl(businessId, link);
      if (existing) continue; // already known — de-dup, don't re-queue

      // NOTE: this file doesn't track exact BFS depth across multiple
      // crawlPage() calls today (crawlPage()'s own public signature has
      // no depth parameter) — depth 1 here is a documented approximation
      // ("discovered via a link, one hop from wherever it was crawled
      // from"), not a precise distance from the original seed. Accurate
      // depth tracking across a whole crawl is deferred to a future
      // Job Manager/Workflow Engine-driven queue — see the file-level
      // "QUEUE MODEL" note.
      await pageService.createPage({
        businessId,
        url: link,
        metadata: { depth: 1, parentUrl, discoveredFrom: "link" satisfies CrawlDiscoverySource },
      });
    } catch {
      // Page Repository has no persistence yet — never let this fail the
      // crawl of the page that discovered these links.
    }
  }
}

export const crawlService = {
  /**
   * Starts a new crawl for a business: resolves its website, seeds a
   * starting queue (homepage + sitemap URLs), and persists each as a
   * pending page. Returns immediately with a `"queued"` CrawlJob — this
   * method does not itself crawl any page's content; see `crawlPage()`
   * for that.
   */
  async startCrawl(input: StartCrawlInput): Promise<CrawlJob> {
    const { businessId } = input;

    // Lookup business.
    const business = await businessService.getBusiness(businessId);
    if (!business) {
      return {
        id: generateId(),
        businessId,
        seedUrl: input.seedUrl,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        pagesFailed: 0,
        duration: null,
        status: "failed",
      };
    }

    // Resolve website — reuse Website Discovery Service's own URL
    // normalization/redirect resolution rather than reimplementing it.
    const reachability = await websiteDiscoveryService.discoverWebsite(businessId);
    const seedUrl = input.seedUrl || reachability.finalUrl || business.website || "";

    if (!seedUrl) {
      return {
        id: generateId(),
        businessId,
        seedUrl: input.seedUrl,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        pagesFailed: 0,
        duration: null,
        status: "failed",
      };
    }

    // Seed queue using homepage + robots sitemap + sitemap.xml fallback —
    // reusing Website Discovery Service's discoverSitemap(), which
    // already implements exactly that fallback chain. No reimplementation
    // of robots.txt/sitemap.xml parsing happens in this file.
    const sitemap = await websiteDiscoveryService.discoverSitemap(businessId);

    const seedQueue = new Set<string>([seedUrl]);
    for (const url of sitemap.urls) {
      if (sameOrigin(url, seedUrl)) seedQueue.add(url);
    }

    for (const url of seedQueue) {
      try {
        await pageService.createPage({
          businessId,
          url,
          metadata: {
            depth: url === seedUrl ? 0 : 1,
            parentUrl: url === seedUrl ? null : seedUrl,
            discoveredFrom: (url === seedUrl ? "seed" : "sitemap") satisfies CrawlDiscoverySource,
          },
        });
      } catch {
        // Page Repository has no persistence yet — never let this fail
        // starting the crawl; pagesDiscovered below still reflects what
        // WAS found, independent of whether it could be saved.
      }
    }

    return {
      id: generateId(),
      businessId,
      seedUrl,
      pagesDiscovered: seedQueue.size,
      pagesCrawled: 0,
      pagesFailed: 0,
      duration: null, // null while in flight — the crawl itself hasn't run any pages yet, only seeded its queue
      status: "queued",
    };
  },

  /**
   * Crawls a single page: downloads its HTML via the Atlas HTTP Client,
   * measures timing, extracts metadata via Metadata Extractor, persists
   * via Page Repository's `markCrawled()`, discovers outbound links, and
   * returns a CrawlPage describing the outcome. Never performs SEO
   * analysis. Never throws — a failed download/parse produces a
   * structured "failed" CrawlPage instead.
   */
  async crawlPage(businessId: string, url: string): Promise<CrawlPage> {
    const discoveredAt = new Date().toISOString();

    // Download HTML, measuring crawl timing — atlasHttp already reports
    // durationMs on its HttpResponse, so no separate timing logic is
    // needed here.
    let response: HttpResponse<string>;
    try {
      response = await downloadHtml(url);
    } catch {
      // Network failure, timeout, or CORS rejection (HttpError from
      // atlasHttp) — one failed page must not terminate a crawl; report
      // a structured failure instead.
      return buildFailedCrawlPage(businessId, url, discoveredAt);
    }

    if (!response.ok || !response.body) {
      return buildFailedCrawlPage(businessId, url, discoveredAt, response.status);
    }

    const finalUrl = response.url || url;
    const contentType = response.headers["content-type"] ?? null;

    // Do NOT parse HTML manually — delegate entirely to Metadata
    // Extractor.
    const extracted = metadataExtractor.extractMetadata({ html: response.body, pageUrl: finalUrl });

    // Extract links using the same core logic discoverLinks() itself
    // uses — called directly here (not via `this.discoverLinks()`)
    // specifically to avoid downloading `finalUrl` a second time, per
    // "avoid duplicate downloads." See extractLinksFromHtml()'s own
    // comment for the full rationale.
    const links = extractLinksFromHtml(response.body, finalUrl);

    const crawlPage = buildPageRecord({
      businessId,
      url: finalUrl,
      extracted,
      statusCode: response.status,
      contentType,
    });

    // Persist via Page Repository's markCrawled() — ensuring a Page
    // record exists first (Page Repository has no upsert-by-url of its
    // own). Currently a no-op/throws until Supabase exists (see
    // pageService's own TODO(supabase) markers) — the crawl itself still
    // succeeded even if persistence isn't wired up yet, so this is
    // caught rather than allowed to overwrite the successful result
    // above.
    try {
      let page = await pageService.getPageByUrl(businessId, finalUrl);
      if (!page) {
        page = await pageService.createPage({ businessId, url: finalUrl });
      }
      await pageService.markCrawled(businessId, page.id, {
        canonicalUrl: extracted.canonicalUrl,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        language: extracted.language,
        statusCode: response.status,
        contentType,
        lastModified: extracted.lastModified,
      });
    } catch {
      // Never let a persistence gap fail an otherwise-successful crawl.
    }

    // Best-effort queue newly discovered same-origin links as pending
    // pages, so a caller driving the crawl via listPages() sees them.
    if (links.length > 0) {
      await queueDiscoveredLinks(businessId, links, finalUrl);
    }

    return crawlPage;
  },

  /**
   * Extracts outbound links from a page's HTML, to be queued as newly
   * discovered pages. Downloads the page itself (via the Atlas HTTP
   * Client) — if the caller already has the page's HTML in hand (e.g.
   * `crawlPage()`, right after downloading it), prefer avoiding a second
   * download rather than calling this method.
   */
  async discoverLinks(businessId: string, pageUrl: string): Promise<string[]> {
    let response: HttpResponse<string>;
    try {
      response = await downloadHtml(pageUrl);
    } catch {
      return []; // never crash — a network failure just means no links discovered
    }

    if (!response.ok || !response.body) return [];

    const discovered = extractLinksFromHtml(response.body, response.url || pageUrl);

    // De-duplicate against pages Atlas already knows about for this
    // business (currently a no-op, since Page Repository has no
    // persistence yet — see pageService.listPages()).
    const known = await pageService.listPages(businessId);
    const knownUrls = new Set(known.map((p) => p.url));

    return discovered.filter((discoveredUrl) => !knownUrls.has(discoveredUrl));
  },

  /**
   * Persists a discovered or crawled page (insert if new, update if it
   * already exists for this business + url). Delegates entirely to
   * `pageService` — this method contains no persistence logic of its
   * own, only the mapping between `CrawlPageInput` and Page Repository's
   * `Page` shape. Propagates whatever `pageService` throws (matching
   * every other Atlas service's "write methods throw" convention) —
   * unlike `crawlPage()`, this method's entire purpose IS persistence, so
   * a failure here should be visible to the caller, not swallowed.
   */
  async savePage(businessId: string, input: CrawlPageInput): Promise<CrawlPage> {
    const contentFields = {
      canonicalUrl: input.canonicalUrl,
      title: input.title,
      metaDescription: input.metaDescription,
      language: input.language,
      statusCode: input.statusCode,
      contentType: input.contentType,
      lastModified: input.lastModified,
      metadata: {
        depth: input.depth,
        parentUrl: input.parentUrl,
        discoveredFrom: input.discoveredFrom,
      },
    };

    const existing = await pageService.getPageByUrl(businessId, input.url);
    const page = existing
      ? await pageService.updatePage(businessId, existing.id, contentFields)
      : await pageService.createPage({ businessId, url: input.url, ...contentFields });

    return pageToCrawlPage(page, input.crawlStatus);
  },

  /**
   * Fetches a single discovered page by id. Delegates entirely to
   * `pageService.getPage()`.
   */
  async getPage(businessId: string, pageId: string): Promise<CrawlPage | null> {
    const page = await pageService.getPage(businessId, pageId);
    return page ? pageToCrawlPage(page) : null;
  },

  /**
   * Lists all discovered pages for a business. Delegates entirely to
   * `pageService.listPages()`.
   */
  async listPages(businessId: string): Promise<CrawlPage[]> {
    const pages = await pageService.listPages(businessId);
    return pages.map((page) => pageToCrawlPage(page));
  },

  /**
   * Deletes a discovered page record. Delegates entirely to
   * `pageService.deletePage()`.
   */
  async deletePage(businessId: string, pageId: string): Promise<void> {
    return pageService.deletePage(businessId, pageId);
  },
};
