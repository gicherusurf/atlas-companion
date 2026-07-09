import type {
  CrawlJob,
  StartCrawlInput,
  CrawlPage,
  CrawlPageInput,
} from "@/types/crawl";

// Atlas Crawl Engine.
//
// Discovers every page belonging to a business's website and extracts
// basic page information (title, meta description, language, status code,
// etc). It does NOT perform SEO analysis — that's a separate, future
// consumer of the pages this engine discovers.
//
// Follows the same architecture as the other Atlas services
// (`business-service.ts`, `website-discovery-service.ts`,
// `job-manager.ts`): a plain object of async methods, every method scoped
// by `businessId`, no mock data, `TODO(crawler)` markers instead of real
// HTTP crawling.
//
// Architecture note: the Crawl Engine will eventually consume
// `websiteDiscoveryService` (e.g. to seed from the sitemap/homepage
// already discovered there), `jobManager` (to track a crawl run as a real
// Job instead of the standalone `CrawlJob` shape below), and `eventBus`
// (to publish page-discovered / crawl-completed events). None of that
// wiring exists yet — this file has no imports from any of them, by
// design, until that integration work is explicitly scoped.

function notImplemented(action: string): never {
  throw new Error(`CrawlService.${action} is not implemented yet — TODO(crawler): wire this up.`);
}

export const crawlService = {
  /**
   * Starts a new crawl for a business from a single seed URL.
   */
  async startCrawl(_input: StartCrawlInput): Promise<CrawlJob> {
    // TODO(crawler):
    //   - create a CrawlJob record (status: "queued")
    //   - enqueue the seed URL as the first page to crawl (depth 0,
    //     discoveredFrom: "seed")
    //   - eventually: register this as a real Job via jobManager instead
    //     of (or in addition to) a standalone CrawlJob record
    return notImplemented("startCrawl");
  },

  /**
   * Crawls a single page: fetches it, extracts basic metadata, and
   * updates its CrawlPage record accordingly.
   */
  async crawlPage(_businessId: string, _url: string): Promise<CrawlPage> {
    // TODO(crawler):
    //   - GET the page, record statusCode, contentType, lastModified
    //   - parse HTML for title, meta description, canonical URL, language
    //   - call discoverLinks() to find further pages to queue
    //   - call savePage() with the extracted data, crawlStatus: "crawled"
    //     (or "failed" if the fetch/parse failed)
    return notImplemented("crawlPage");
  },

  /**
   * Extracts outbound links from a page's HTML, to be queued as newly
   * discovered pages.
   */
  async discoverLinks(_businessId: string, _pageUrl: string): Promise<string[]> {
    // TODO(crawler):
    //   - parse <a href> links from the page's HTML
    //   - normalize relative URLs against pageUrl
    //   - filter to same-origin links (or a configurable allowlist)
    //   - de-duplicate against pages already known for this business
    return notImplemented("discoverLinks");
  },

  /**
   * Persists a discovered or crawled page (insert if new, update if it
   * already exists for this business + url).
   */
  async savePage(_businessId: string, _input: CrawlPageInput): Promise<CrawlPage> {
    // TODO(crawler): supabase.from("crawl_pages").upsert({
    //   business_id: businessId,
    //   ...input,
    // }, { onConflict: "business_id,url" }).select().single()
    return notImplemented("savePage");
  },

  /**
   * Fetches a single discovered page by id.
   */
  async getPage(_businessId: string, _pageId: string): Promise<CrawlPage | null> {
    // TODO(crawler): supabase.from("crawl_pages").select("*")
    //   .eq("id", pageId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists all discovered pages for a business.
   */
  async listPages(_businessId: string): Promise<CrawlPage[]> {
    // TODO(crawler): supabase.from("crawl_pages").select("*")
    //   .eq("business_id", businessId).order("discovered_at")
    return [];
  },

  /**
   * Deletes a discovered page record.
   */
  async deletePage(_businessId: string, _pageId: string): Promise<void> {
    // TODO(crawler): supabase.from("crawl_pages").delete()
    //   .eq("id", pageId).eq("business_id", businessId)
    return notImplemented("deletePage");
  },
};
