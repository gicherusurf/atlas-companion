// TODO: once Supabase tables exist, generate/align these with the DB schema
// (e.g. via `supabase gen types typescript`) instead of hand-maintaining them.

/**
 * Where a page was discovered from during a crawl.
 */
export type CrawlDiscoverySource = "seed" | "sitemap" | "link" | "manual";

/**
 * Lifecycle status of a single discovered page.
 */
export type CrawlPageStatus = "pending" | "crawled" | "failed" | "skipped";

/**
 * A single page discovered on a business's website. The Crawl Engine only
 * discovers pages and extracts basic on-page information — it does not
 * perform any SEO analysis (that's a separate, future consumer of this
 * data).
 */
export interface CrawlPage {
  id: string;
  businessId: string;
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  language: string | null;
  statusCode: number | null;
  lastModified: string | null;
  contentType: string | null;
  /** Link depth from the seed URL (seed itself is depth 0). */
  depth: number;
  /** The URL of the page this one was linked from, if discovered via a link. */
  parentUrl: string | null;
  discoveredFrom: CrawlDiscoverySource;
  crawlStatus: CrawlPageStatus;
  discoveredAt: string;
  updatedAt: string;
}

/**
 * Fields needed to record a newly discovered (not-yet-crawled) page, or to
 * upsert a page's crawled data. `id`, `discoveredAt`, and `updatedAt` are
 * set by the service.
 */
export type CrawlPageInput = Omit<CrawlPage, "id" | "discoveredAt" | "updatedAt">;

export type CrawlJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/**
 * Tracks a single crawl run for a business, starting from one seed URL.
 * This is intentionally a separate concept from `Job` in `src/types/job.ts`
 * for now — the Crawl Engine will eventually create/update a real `Job` via
 * `jobManager` to track a crawl run, but that wiring isn't in place yet.
 */
export interface CrawlJob {
  id: string;
  businessId: string;
  seedUrl: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesFailed: number;
  /** Wall-clock duration once the crawl finishes; null while in flight. */
  duration: number | null;
  status: CrawlJobStatus;
}

/**
 * Fields needed to start a new crawl. `id` and the running counters
 * (pagesDiscovered/pagesCrawled/pagesFailed/duration/status) are set by
 * the service.
 */
export type StartCrawlInput = Pick<CrawlJob, "businessId" | "seedUrl">;
