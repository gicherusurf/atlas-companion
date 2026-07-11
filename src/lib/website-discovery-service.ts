import { businessService } from "@/lib/business-service";
import { metadataExtractor } from "@/lib/metadata-extractor";
import type { OpenGraph } from "@/types/metadata";
import type {
  WebsiteReachabilityResult,
  RobotsTxtResult,
  SitemapResult,
  HomepageDiscoveryResult,
  OpenGraphTags,
} from "@/types/website-discovery";

// Website Discovery Engine — production implementation.
//
// This service discovers what exists at a business's website: whether
// it's reachable, its robots.txt, its sitemap(s), and basic homepage
// metadata. It follows the same architecture as `business-service.ts`:
// a plain object of async methods (no class), every method scoped by
// `businessId` — a business's own website is looked up via
// `businessService.getBusiness(businessId)` before any discovery work.
//
// RUNTIME NOTE: Atlas runs in the browser (Vite). Every fetch below is a
// direct browser `fetch()` call, which has two real consequences:
//   1. CORS — most external sites do not send permissive CORS headers,
//      so a direct browser fetch to an arbitrary business's homepage,
//      robots.txt, or sitemap will frequently fail even when the site is
//      perfectly reachable. `safeFetch()` treats this the same as any
//      other network failure (never throws; reports it as unreachable).
//   2. Opaque redirects/responses — browser fetch cannot always expose
//      full response detail for cross-origin requests.
//
// TODO(edge-function): every fetch call site below is marked with a
// TODO(edge-function) comment. The intended fix for both issues above is
// to move these HTTP calls behind a Supabase Edge Function (or an
// equivalent backend/edge proxy) that fetches server-side and returns a
// clean JSON result — at that point, each method's *public API defined
// here does not change at all*; only the internal fetch calls get
// replaced with calls to that edge function. That's the whole point of
// keeping `normalizeUrl`/`safeFetch`/`fetchWithTiming` as small, isolated
// helpers: swapping their internals later is a contained change.

// --- Shared helpers ------------------------------------------------------

/**
 * Normalizes a business-supplied website string (which may be missing a
 * scheme, e.g. "example.com") into a fully-qualified, absolute URL string
 * (e.g. "https://example.com/"). Returns null for empty or genuinely
 * unparseable input, rather than throwing.
 */
function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/**
 * The scheme+host portion of a URL (e.g. "https://example.com"), used to
 * build absolute paths like "/robots.txt" against a business's own site.
 */
function getOrigin(url: string): string {
  return new URL(url).origin;
}

/**
 * Resolves a business's normalized website URL, or null if the business
 * doesn't exist or has no website set. Shared by every method below so
 * the businessService lookup + normalization isn't duplicated four times.
 */
async function getNormalizedWebsite(businessId: string): Promise<string | null> {
  const business = await businessService.getBusiness(businessId);
  if (!business?.website) return null;
  return normalizeUrl(business.website);
}

/**
 * Wraps `fetch()` so a network failure (DNS failure, CORS rejection,
 * timeout, offline, etc.) is reported as a structured result instead of
 * throwing. This is the single point every other fetch in this file goes
 * through, per "never crash — return structured failures."
 */
async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response | null; error: string | null }> {
  try {
    const response = await fetch(url, init);
    return { response, error: null };
  } catch (err) {
    return { response: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Same as `safeFetch()`, but also measures elapsed time in milliseconds —
 * used by `discoverWebsite()` to report `responseTimeMs`.
 */
async function fetchWithTiming(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response | null; error: string | null; durationMs: number }> {
  const start = performance.now();
  const { response, error } = await safeFetch(url, init);
  const durationMs = Math.round(performance.now() - start);
  return { response, error, durationMs };
}

/**
 * Extracts every `Sitemap:` directive from a robots.txt file's contents.
 */
function parseRobots(content: string): string[] {
  const sitemapUrls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match) sitemapUrls.push(match[1]);
  }
  return sitemapUrls;
}

/**
 * Extracts every `<loc>` URL from a sitemap XML document (handles both a
 * plain `<urlset>` and a `<sitemapindex>` — both use `<loc>` the same
 * way). Uses the browser's native `DOMParser`, since Atlas runs in the
 * browser and this avoids taking on an XML parsing dependency for what
 * `DOMParser` already does natively.
 */
function parseSitemap(xml: string): string[] {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return [];

    return Array.from(doc.getElementsByTagName("loc"))
      .map((node) => node.textContent?.trim())
      .filter((url): url is string => !!url);
  } catch {
    return [];
  }
}

/**
 * Maps the Metadata Extraction Engine's `OpenGraph` shape (unprefixed
 * field names, shared across all page metadata) onto this service's own
 * `OpenGraphTags` shape (prefixed field names, matching the `og:*` tag
 * names directly). These are deliberately different types — see
 * `src/types/metadata.ts` vs. `src/types/website-discovery.ts` — so this
 * mapping is a real, necessary conversion, not incidental duplication.
 */
function toDiscoveryOpenGraph(og: OpenGraph): OpenGraphTags {
  return {
    ogTitle: og.title,
    ogDescription: og.description,
    ogImage: og.image,
    ogUrl: og.url,
    ogType: og.type,
  };
}

export const websiteDiscoveryService = {
  /**
   * Checks whether the business's website is reachable, follows redirects
   * to find the final URL, and confirms HTTPS + response timing.
   */
  async discoverWebsite(businessId: string): Promise<WebsiteReachabilityResult> {
    const checkedAt = new Date().toISOString();

    try {
      const normalized = await getNormalizedWebsite(businessId);
      if (!normalized) {
        return {
          businessId,
          reachable: false,
          finalUrl: null,
          httpsEnabled: false,
          statusCode: null,
          responseTimeMs: null,
          checkedAt,
        };
      }

      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function that performs this fetch server-side, avoiding CORS and
      // giving reliable access to the final redirected URL.
      const { response, durationMs } = await fetchWithTiming(normalized, {
        method: "GET",
        redirect: "follow",
      });

      if (!response) {
        return {
          businessId,
          reachable: false,
          finalUrl: null,
          httpsEnabled: normalized.startsWith("https://"),
          statusCode: null,
          responseTimeMs: durationMs,
          checkedAt,
        };
      }

      const finalUrl = response.url || normalized;
      return {
        businessId,
        reachable: response.ok,
        finalUrl,
        httpsEnabled: finalUrl.startsWith("https://"),
        statusCode: response.status,
        responseTimeMs: durationMs,
        checkedAt,
      };
    } catch {
      // Absolute last-resort guard — every branch above already handles
      // its own failures, but this keeps the "never crash" guarantee
      // even against a mistake introduced in a future edit.
      return {
        businessId,
        reachable: false,
        finalUrl: null,
        httpsEnabled: false,
        statusCode: null,
        responseTimeMs: null,
        checkedAt,
      };
    }
  },

  /**
   * Fetches and parses the business's robots.txt, extracting any
   * `Sitemap:` directives found within it.
   */
  async discoverRobotsTxt(businessId: string): Promise<RobotsTxtResult> {
    const checkedAt = new Date().toISOString();

    try {
      const normalized = await getNormalizedWebsite(businessId);
      if (!normalized) {
        return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
      }

      const robotsUrl = `${getOrigin(normalized)}/robots.txt`;
      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function — see discoverWebsite() for why.
      const { response } = await safeFetch(robotsUrl);

      if (!response || !response.ok) {
        return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
      }

      const content = await response.text().catch(() => null);
      if (content === null) {
        return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
      }

      return { businessId, exists: true, content, sitemapUrls: parseRobots(content), checkedAt };
    } catch {
      return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
    }
  },

  /**
   * Discovers the business's sitemap (from robots.txt or a conventional
   * /sitemap.xml path) and parses out the URLs it lists.
   */
  async discoverSitemap(businessId: string): Promise<SitemapResult> {
    const checkedAt = new Date().toISOString();

    try {
      const normalized = await getNormalizedWebsite(businessId);
      if (!normalized) {
        return { businessId, exists: false, urls: [], urlCount: 0, checkedAt };
      }

      const robots = await this.discoverRobotsTxt(businessId);
      const candidateUrls =
        robots.sitemapUrls.length > 0 ? robots.sitemapUrls : [`${getOrigin(normalized)}/sitemap.xml`];

      for (const sitemapUrl of candidateUrls) {
        // TODO(edge-function): replace with a call to a Supabase Edge
        // Function — see discoverWebsite() for why.
        const { response } = await safeFetch(sitemapUrl);
        if (!response || !response.ok) continue;

        const xml = await response.text().catch(() => null);
        if (!xml) continue;

        const urls = parseSitemap(xml);
        if (urls.length > 0) {
          return { businessId, exists: true, urls, urlCount: urls.length, checkedAt };
        }
      }

      return { businessId, exists: false, urls: [], urlCount: 0, checkedAt };
    } catch {
      return { businessId, exists: false, urls: [], urlCount: 0, checkedAt };
    }
  },

  /**
   * Fetches the business's homepage and extracts basic on-page metadata.
   */
  async discoverHomepage(businessId: string): Promise<HomepageDiscoveryResult> {
    const checkedAt = new Date().toISOString();
    const empty: HomepageDiscoveryResult = {
      businessId,
      title: null,
      metaDescription: null,
      canonicalUrl: null,
      language: null,
      h1: null,
      openGraph: { ogTitle: null, ogDescription: null, ogImage: null, ogUrl: null, ogType: null },
      checkedAt,
    };

    try {
      const normalized = await getNormalizedWebsite(businessId);
      if (!normalized) return empty;

      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function — see discoverWebsite() for why.
      const { response } = await safeFetch(normalized);
      if (!response || !response.ok) return empty;

      const html = await response.text().catch(() => null);
      if (!html) return empty;

      const pageUrl = response.url || normalized;

      // Do NOT duplicate parsing logic here — delegate to the Metadata
      // Extraction Engine. TODO(metadata-extractor): as of this writing,
      // `metadataExtractor.extractMetadata()` itself still throws (see
      // its own TODO(parser) markers in `src/lib/metadata-extractor.ts`)
      // — implementing HTML parsing is explicitly out of scope for this
      // task. Until that lands, this call throws and we fall back to
      // `empty` below; once Metadata Extractor is implemented, this
      // method starts returning real extracted values with ZERO changes
      // needed here.
      const extracted = metadataExtractor.extractMetadata({ html, pageUrl });

      const h1 = extracted.headings.find((heading) => heading.level === 1)?.text ?? null;

      return {
        businessId,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        canonicalUrl: extracted.canonicalUrl,
        language: extracted.language,
        h1,
        openGraph: toDiscoveryOpenGraph(extracted.openGraph),
        checkedAt,
      };
    } catch {
      return empty;
    }
  },
};
