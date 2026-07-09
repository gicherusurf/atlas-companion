// TODO: once Supabase tables exist, generate/align these with the DB schema
// (e.g. via `supabase gen types typescript`) instead of hand-maintaining them.

/**
 * Crawl lifecycle status of a page.
 */
export type PageStatus = "discovered" | "queued" | "crawled" | "failed";

/**
 * SEO analysis status of a page. Set by a future SEO Audit Engine — the
 * Page Repository only stores this value, it never computes it.
 */
export type SEOStatus = "pending" | "analyzed" | "optimized";

/**
 * Content lifecycle status of a page. Set by a future Content Engine —
 * the Page Repository only stores this value, it never generates content.
 */
export type ContentStatus = "none" | "generated" | "published";

/**
 * The canonical record for a single page Atlas knows about, scoped to a
 * business. This is the shared source of truth every domain module reads
 * from and writes to: the Crawl Engine writes discovered/crawled pages
 * here, and SEO Audit, Keyword, Content, Competitor, and Analytics engines
 * all read (and update their own status fields on) pages from here.
 *
 * The Page Repository itself performs no crawling, no AI, and no SEO
 * analysis — it is purely storage and query.
 */
export interface Page {
  id: string;
  businessId: string;
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  language: string | null;
  statusCode: number | null;
  contentType: string | null;
  h1: string | null;
  wordCount: number | null;
  crawlStatus: PageStatus;
  seoStatus: SEOStatus;
  contentStatus: ContentStatus;
  lastCrawledAt: string | null;
  lastModified: string | null;
  createdAt: string;
  updatedAt: string;
  /** Arbitrary domain-specific data consumers want attached to a page. */
  metadata: Record<string, unknown>;
}

/**
 * On-page fields that can be supplied when creating or updating a page.
 * Excludes identity fields (id/businessId/url), timestamps, and the three
 * status fields — status changes go through the dedicated lifecycle
 * methods (markCrawled, markSeoAnalyzed, markPublished) instead of a
 * generic update.
 */
type PageContentFields = Pick<
  Page,
  | "canonicalUrl"
  | "title"
  | "metaDescription"
  | "language"
  | "statusCode"
  | "contentType"
  | "h1"
  | "wordCount"
  | "lastModified"
  | "metadata"
>;

/**
 * Fields needed to record a newly discovered page. `crawlStatus` starts as
 * "discovered", `seoStatus` as "pending", and `contentStatus` as "none" —
 * set by the service, not the caller.
 */
export type CreatePageInput = Pick<Page, "businessId" | "url"> & Partial<PageContentFields>;

/**
 * Fields that can be patched on a page outside of a lifecycle transition.
 */
export type UpdatePageInput = Partial<PageContentFields>;

/**
 * Fields supplied when marking a page as crawled — the extracted on-page
 * data. `crawlStatus` becomes "crawled" and `lastCrawledAt` is stamped by
 * the service.
 */
export type MarkCrawledInput = Partial<PageContentFields>;

/**
 * Optional filters for listPages().
 */
export interface ListPagesFilter {
  crawlStatus?: PageStatus;
  seoStatus?: SEOStatus;
  contentStatus?: ContentStatus;
}

/**
 * Search filter for searchPages() — a free-text query (matched against
 * url/title/metaDescription) combined with the same optional status
 * filters as listPages().
 */
export interface PageSearchFilter extends ListPagesFilter {
  query: string;
}
