// TODO: once real discovery is implemented, verify these shapes still line
// up with whatever gets persisted (e.g. a `website_discovery_runs` table),
// and align via `supabase gen types typescript` if so.

/**
 * Result of checking whether a business's website is reachable, what URL
 * it resolves to after redirects, and basic connection info.
 */
export interface WebsiteReachabilityResult {
  businessId: string;
  reachable: boolean;
  finalUrl: string | null;
  httpsEnabled: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  checkedAt: string;
}

/**
 * Result of fetching and parsing a business's robots.txt.
 */
export interface RobotsTxtResult {
  businessId: string;
  exists: boolean;
  content: string | null;
  sitemapUrls: string[];
  checkedAt: string;
}

/**
 * Result of discovering and parsing a business's sitemap(s).
 */
export interface SitemapResult {
  businessId: string;
  exists: boolean;
  urls: string[];
  urlCount: number;
  checkedAt: string;
}

/**
 * Open Graph metadata found on the homepage, if any.
 */
export interface OpenGraphTags {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
}

/**
 * Result of fetching and parsing a business's homepage.
 */
export interface HomepageDiscoveryResult {
  businessId: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  h1: string | null;
  openGraph: OpenGraphTags;
  checkedAt: string;
}
