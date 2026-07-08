import type {
  WebsiteReachabilityResult,
  RobotsTxtResult,
  SitemapResult,
  HomepageDiscoveryResult,
} from "@/types/website-discovery";

// Epic 2 / Sprint 1 — Website Discovery Engine.
//
// This service discovers what exists at a business's website: whether it's
// reachable, its robots.txt, its sitemap(s), and basic homepage metadata.
// It follows the same architecture as `business-service.ts`:
//   - a plain object of async methods (no class)
//   - every method scoped by `businessId`, matching the multi-business
//     architecture — a business's own website is looked up via
//     `businessService.getBusiness(businessId)` before any discovery work
//   - TODO(crawl) markers instead of mock data: no real crawling happens
//     yet, so methods throw rather than fabricate results
//
// TODO(crawl): all four methods below will eventually need to:
//   1. const business = await businessService.getBusiness(businessId);
//   2. bail out early (reachable: false / exists: false) if business or
//      business.website is missing, rather than throwing
//   3. perform the actual HTTP fetch / parsing described per-method below

function notImplemented(action: string): never {
  throw new Error(
    `WebsiteDiscoveryService.${action} is not implemented yet — TODO(crawl): wire this up.`,
  );
}

export const websiteDiscoveryService = {
  /**
   * Checks whether the business's website is reachable, follows redirects
   * to find the final URL, and confirms HTTPS + response timing.
   */
  async discoverWebsite(_businessId: string): Promise<WebsiteReachabilityResult> {
    // TODO(crawl):
    //   - look up business.website via businessService.getBusiness(businessId)
    //   - issue an HTTP request (following redirects), recording:
    //     final resolved URL, whether the final URL is https, the response
    //     status code, and elapsed time in ms
    //   - handle timeouts / DNS failures as `reachable: false` rather than
    //     throwing, once this is for real
    return notImplemented("discoverWebsite");
  },

  /**
   * Fetches and parses the business's robots.txt, extracting any
   * `Sitemap:` directives found within it.
   */
  async discoverRobotsTxt(_businessId: string): Promise<RobotsTxtResult> {
    // TODO(crawl):
    //   - GET {origin}/robots.txt
    //   - if 200, store raw content and parse out `Sitemap:` lines into
    //     sitemapUrls
    //   - if 404 or unreachable, exists: false, content: null, sitemapUrls: []
    return notImplemented("discoverRobotsTxt");
  },

  /**
   * Discovers the business's sitemap (from robots.txt or a conventional
   * /sitemap.xml path) and parses out the URLs it lists.
   */
  async discoverSitemap(_businessId: string): Promise<SitemapResult> {
    // TODO(crawl):
    //   - prefer sitemap URL(s) found via discoverRobotsTxt; fall back to
    //     {origin}/sitemap.xml
    //   - parse XML (handle plain <urlset> and <sitemapindex> nesting)
    //   - populate urls + urlCount = urls.length
    return notImplemented("discoverSitemap");
  },

  /**
   * Fetches the business's homepage and extracts basic on-page metadata.
   */
  async discoverHomepage(_businessId: string): Promise<HomepageDiscoveryResult> {
    // TODO(crawl):
    //   - GET the homepage (reuse finalUrl from discoverWebsite if available)
    //   - parse HTML for: <title>, <meta name="description">,
    //     <link rel="canonical">, <html lang="...">, first <h1>, and
    //     Open Graph meta tags (og:title, og:description, og:image, og:url,
    //     og:type)
    return notImplemented("discoverHomepage");
  },
};
