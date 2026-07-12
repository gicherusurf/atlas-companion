import { businessService } from "@/lib/business-service";
import { metadataExtractor } from "@/lib/metadata-extractor";
import { atlasHttp } from "@/lib/http-client";
import type { HttpError } from "@/types/http";
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
// NETWORKING: every HTTP call in this file goes through `atlasHttp`
// (`src/lib/http-client.ts`) rather than calling `fetch()` directly, per
// Atlas's kernel networking layer. `atlasHttp` already handles timeout,
// redirect-following, timing, and error normalization — this file no
// longer needs its own `safeFetch`/`fetchWithTiming` helpers, since that
// responsibility now lives in the HTTP Client itself.
//
// RUNTIME NOTE: Atlas runs in the browser (Vite). Most external sites do
// not send permissive CORS headers, so a browser-side request to an
// arbitrary business's homepage, robots.txt, or sitemap will frequently
// fail even when the site is perfectly reachable — `atlasHttp` surfaces
// that as a thrown `HttpError`, which every method below catches and
// treats the same as "not reachable"/"doesn't exist," per "never crash."
//
// TODO(edge-function): every `atlasHttp` call below is marked with a
// TODO(edge-function) comment. The intended fix for CORS is to move these
// calls behind a Supabase Edge Function (or an equivalent backend/edge
// proxy) that performs the request server-side — at that point, only the
// URL each call targets changes (pointing at the edge function instead of
// the target site directly); every public method's signature and
// behavior defined here stays the same.

// --- Local (domain-specific, not networking) helpers ---------------------

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

/**
 * Type guard narrowing a caught exception to the `HttpError` shape
 * `atlasHttp` throws, so each method below can distinguish "the request
 * failed outright" (network/timeout/CORS — expected, handled gracefully)
 * from a genuine bug elsewhere in the method (which should NOT be
 * silently swallowed the same way).
 */
function isHttpError(err: unknown): err is HttpError {
  return (
    typeof err === "object" &&
    err !== null &&
    "retryable" in err &&
    "status" in err &&
    "url" in err
  );
}

export const websiteDiscoveryService = {
  /**
   * Checks whether the business's website is reachable, follows redirects
   * to find the final URL, and confirms HTTPS + response timing.
   */
  async discoverWebsite(businessId: string): Promise<WebsiteReachabilityResult> {
    const checkedAt = new Date().toISOString();

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

    try {
      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function that performs this request server-side, avoiding CORS
      // and giving reliable access to the final redirected URL.
      const response = await atlasHttp.get(normalized, { followRedirects: true });

      return {
        businessId,
        reachable: response.ok,
        finalUrl: response.url,
        httpsEnabled: response.url.startsWith("https://"),
        statusCode: response.status,
        responseTimeMs: response.durationMs,
        checkedAt,
      };
    } catch (err) {
      if (!isHttpError(err)) throw err;
      return {
        businessId,
        reachable: false,
        finalUrl: null,
        httpsEnabled: normalized.startsWith("https://"),
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

    const normalized = await getNormalizedWebsite(businessId);
    if (!normalized) {
      return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
    }

    try {
      const robotsUrl = `${getOrigin(normalized)}/robots.txt`;
      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function — see discoverWebsite() for why.
      const response = await atlasHttp.get<string>(robotsUrl);

      if (!response.ok || response.body === null) {
        return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
      }

      return {
        businessId,
        exists: true,
        content: response.body,
        sitemapUrls: parseRobots(response.body),
        checkedAt,
      };
    } catch (err) {
      if (!isHttpError(err)) throw err;
      return { businessId, exists: false, content: null, sitemapUrls: [], checkedAt };
    }
  },

  /**
   * Discovers the business's sitemap (from robots.txt or a conventional
   * /sitemap.xml path) and parses out the URLs it lists.
   */
  async discoverSitemap(businessId: string): Promise<SitemapResult> {
    const checkedAt = new Date().toISOString();

    const normalized = await getNormalizedWebsite(businessId);
    if (!normalized) {
      return { businessId, exists: false, urls: [], urlCount: 0, checkedAt };
    }

    const robots = await this.discoverRobotsTxt(businessId);
    const candidateUrls =
      robots.sitemapUrls.length > 0 ? robots.sitemapUrls : [`${getOrigin(normalized)}/sitemap.xml`];

    for (const sitemapUrl of candidateUrls) {
      try {
        // TODO(edge-function): replace with a call to a Supabase Edge
        // Function — see discoverWebsite() for why.
        const response = await atlasHttp.get<string>(sitemapUrl);
        if (!response.ok || !response.body) continue;

        const urls = parseSitemap(response.body);
        if (urls.length > 0) {
          return { businessId, exists: true, urls, urlCount: urls.length, checkedAt };
        }
      } catch (err) {
        if (!isHttpError(err)) throw err;
        // This candidate sitemap URL failed outright (network/CORS/
        // timeout) — try the next candidate rather than failing the
        // whole discovery.
        continue;
      }
    }

    return { businessId, exists: false, urls: [], urlCount: 0, checkedAt };
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

    const normalized = await getNormalizedWebsite(businessId);
    if (!normalized) return empty;

    try {
      // TODO(edge-function): replace with a call to a Supabase Edge
      // Function — see discoverWebsite() for why.
      const response = await atlasHttp.get<string>(normalized);
      if (!response.ok || !response.body) return empty;

      const pageUrl = response.url;

      // Do NOT duplicate parsing logic here — delegate to the Metadata
      // Extraction Engine. TODO(metadata-extractor): as of this writing,
      // `metadataExtractor.extractMetadata()` itself still throws (see
      // its own TODO(parser) markers in `src/lib/metadata-extractor.ts`)
      // — implementing HTML parsing is out of scope for this file. Until
      // that lands, this call throws and we fall back to `empty` below;
      // once Metadata Extractor is implemented, this method starts
      // returning real extracted values with ZERO changes needed here.
      const extracted = metadataExtractor.extractMetadata({ html: response.body, pageUrl });

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
      // Catches both HttpError (network/CORS/timeout) and the
      // not-yet-implemented metadataExtractor throw described above —
      // either way, the honest result today is "no metadata available."
      return empty;
    }
  },
};
