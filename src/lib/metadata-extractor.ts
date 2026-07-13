import type {
  ExtractedMetadata,
  ExtractMetadataInput,
  Heading,
  OpenGraph,
  TwitterCard,
  StructuredData,
} from "@/types/metadata";

// Atlas Metadata Extraction Engine — production implementation.
//
// Converts raw HTML into structured page metadata. It does NOT crawl
// websites (the Crawl Engine downloads HTML), NEVER performs HTTP
// requests itself, NEVER queries Supabase, and NEVER imports the Crawl
// Engine — it is a pure, synchronous parsing function of (html,
// pageUrl). It does NOT perform any SEO analysis, scoring, or
// recommendations — it only extracts facts directly present in the
// markup.
//
// Unlike most other Atlas services, these methods are NOT scoped by
// `businessId` — this engine has no persistence and no business context
// of its own; callers (Crawl Engine, Page Repository) are responsible
// for associating the returned `ExtractedMetadata` with a business/page
// record.
//
// PARSER: uses the browser's native `DOMParser` exclusively — no
// third-party HTML library. `DOMParser.parseFromString(html, "text/html")`
// never throws, even on malformed markup (HTML parsing is defined to
// always produce *some* document), which is a large part of why this
// engine can guarantee "never throw" itself.
//
// PERFORMANCE: `extractMetadata()` parses `html` into a `Document`
// exactly once, then calls a set of private `*FromDoc` functions against
// that single parsed `Document` — none of the 12 fields it assembles
// trigger a second parse. Each PUBLIC single-purpose method
// (`extractTitle`, `extractHeadings`, etc.) still accepts raw `html` and
// remains independently callable/testable, as designed — it simply
// parses its own `Document` via `getDocument()` and delegates to the
// same `*FromDoc` core `extractMetadata()` uses, so there is exactly one
// implementation of each piece of extraction logic, never two.
//
// Design principle: single responsibility. Every extraction method
// extracts exactly one thing, and is independently unit-testable.
// `extractMetadata()` is the only method that orchestrates the others.
//
// Future consumers: Crawl Engine (to populate a page after fetching it),
// Page Repository (storage target for the extracted data), SEO Audit
// Engine, Content Engine, and Analytics. This file must never import from
// any of them, and must never contain SEO scoring logic — only extraction.

// --- Private helpers -----------------------------------------------------
// Small, single-purpose, and reused rather than duplicated — per
// "never duplicate DOM queries."

/**
 * Parses raw HTML into a Document. Never throws — HTML parsing always
 * produces a document, even for malformed markup.
 */
function getDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Collapses whitespace and trims a string, returning null for an empty
 * (or whitespace-only, or absent) result rather than an empty string.
 */
function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads a `<meta name="...">` tag's `content` attribute, matching the
 * name case-insensitively (some pages write `Description` or
 * `VIEWPORT`). Returns null if the tag or its content is absent.
 */
function getMeta(doc: Document, name: string): string | null {
  const el = doc.querySelector(`meta[name="${name}" i]`);
  return cleanText(el?.getAttribute("content"));
}

/**
 * Reads a `<meta property="...">` tag's `content` attribute — the
 * convention Open Graph tags use instead of `name`. Falls back to
 * checking `name="..."` too, since some pages write Open Graph tags with
 * `name` instead of `property` despite the spec calling for `property`.
 */
function getProperty(doc: Document, property: string): string | null {
  const el = doc.querySelector(`meta[property="${property}" i], meta[name="${property}" i]`);
  return cleanText(el?.getAttribute("content"));
}

/**
 * Resolves a possibly-relative URL against a base URL into an absolute
 * URL string. Returns null (never throws) for unparseable input.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Schemes that should never be counted as either an internal or external
 * link (they don't point to another page at all).
 */
function isIgnoredLinkScheme(href: string): boolean {
  return /^\s*(mailto|tel|javascript):/i.test(href);
}

/**
 * Determines whether `href` (resolved against `pageUrl`) points to the
 * same origin as `pageUrl`. Returns null (meaning "ignore this link
 * entirely") for ignored schemes or unparseable/malformed URLs, rather
 * than guessing — callers should skip a link `isInternalLink` returns
 * null for, not count it either way.
 */
function isInternalLink(href: string, pageUrl: string): boolean | null {
  if (!href || isIgnoredLinkScheme(href)) return null;
  const resolved = resolveUrl(href, pageUrl);
  if (!resolved) return null;
  try {
    return new URL(resolved).origin === new URL(pageUrl).origin;
  } catch {
    return null;
  }
}

// --- Core extraction logic, operating on an already-parsed Document ------
// Each function here is the SINGLE implementation of one piece of
// extraction logic. Both the public per-field methods and
// extractMetadata()'s single-pass orchestration call these — never
// duplicated between the two.

function getTitleFromDoc(doc: Document): string | null {
  return cleanText(doc.querySelector("title")?.textContent);
}

function getMetaDescriptionFromDoc(doc: Document): string | null {
  return getMeta(doc, "description");
}

function getCanonicalFromDoc(doc: Document, pageUrl: string): string | null {
  const href = doc.querySelector('link[rel="canonical" i]')?.getAttribute("href");
  return href ? resolveUrl(href, pageUrl) : null;
}

function getLanguageFromDoc(doc: Document): string | null {
  const htmlLang = cleanText(doc.documentElement?.getAttribute("lang"));
  if (htmlLang) return htmlLang;
  return getMeta(doc, "content-language") ?? cleanText(doc.querySelector('meta[http-equiv="content-language" i]')?.getAttribute("content"));
}

function getHeadingsFromDoc(doc: Document): Heading[] {
  // querySelectorAll returns matches in document order per the DOM spec,
  // so headings come out in document order without any extra traversal.
  const headings: Heading[] = [];
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const text = cleanText(el.textContent);
    if (!text) return; // ignore empty headings
    const level = Number(el.tagName.slice(1));
    headings.push({ level, text });
  });
  return headings;
}

function getOpenGraphFromDoc(doc: Document): OpenGraph {
  return {
    title: getProperty(doc, "og:title"),
    description: getProperty(doc, "og:description"),
    image: getProperty(doc, "og:image"),
    url: getProperty(doc, "og:url"),
    type: getProperty(doc, "og:type"),
    siteName: getProperty(doc, "og:site_name"),
    locale: getProperty(doc, "og:locale"),
  };
}

function getTwitterCardFromDoc(doc: Document): TwitterCard {
  return {
    card: getMeta(doc, "twitter:card"),
    title: getMeta(doc, "twitter:title"),
    description: getMeta(doc, "twitter:description"),
    image: getMeta(doc, "twitter:image"),
    creator: getMeta(doc, "twitter:creator"),
    site: getMeta(doc, "twitter:site"),
  };
}

/**
 * Best-effort extraction of a schema.org `@type` from a parsed JSON-LD
 * value, handling the common shapes: a plain object, an array of
 * objects, or a `@graph` array. Returns null rather than guessing when
 * the shape isn't recognized.
 */
function extractJsonLdType(value: unknown): string | null {
  if (Array.isArray(value)) {
    return extractJsonLdType(value[0]);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) {
      return extractJsonLdType(obj["@graph"]);
    }
    const type = obj["@type"];
    if (typeof type === "string") return type;
    if (Array.isArray(type) && typeof type[0] === "string") return type[0];
  }
  return null;
}

function getStructuredDataFromDoc(doc: Document): StructuredData[] {
  const entries: StructuredData[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    const raw = script.textContent ?? "";
    const trimmedRaw = raw.trim();
    if (!trimmedRaw) return;

    try {
      const parsed = JSON.parse(trimmedRaw);
      entries.push({ type: extractJsonLdType(parsed), format: "json-ld", raw: trimmedRaw });
    } catch {
      // Invalid JSON in this block — skip it, never throw, per "if JSON
      // parsing fails, do not throw. Skip invalid blocks."
    }
  });
  return entries;
}

function getWordCountFromDoc(doc: Document): number {
  const body = doc.body;
  if (!body) return 0;

  // Clone so removing script/style/noscript/template never mutates the
  // Document other extractions in the same extractMetadata() call still
  // need to read from.
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());

  const text = clone.textContent ?? "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function getImageCountFromDoc(doc: Document): number {
  return doc.querySelectorAll("img").length;
}

/**
 * Classifies every `<a href>` on the page as internal or external in a
 * single anchor-iteration pass, resolving each href exactly once — used
 * by extractMetadata() so internalLinkCount/externalLinkCount don't
 * require walking the anchor list twice.
 */
function classifyLinksFromDoc(doc: Document, pageUrl: string): { internal: number; external: number } {
  let internal = 0;
  let external = 0;

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    const isInternal = isInternalLink(href, pageUrl);
    if (isInternal === null) return; // ignored scheme or unparseable — never throw, never guess
    if (isInternal) internal++;
    else external++;
  });

  return { internal, external };
}

function getFaviconFromDoc(doc: Document, pageUrl: string): string | null {
  const href = doc
    .querySelector('link[rel="icon" i], link[rel="shortcut icon" i]')
    ?.getAttribute("href");
  return href ? resolveUrl(href, pageUrl) : null;
}

function getCharsetFromDoc(doc: Document): string | null {
  const metaCharset = doc.querySelector("meta[charset]");
  if (metaCharset) {
    return cleanText(metaCharset.getAttribute("charset"));
  }
  const contentType = doc.querySelector('meta[http-equiv="Content-Type" i]')?.getAttribute("content");
  const match = contentType?.match(/charset=([^;]+)/i);
  return match ? cleanText(match[1]) : null;
}

export const metadataExtractor = {
  /**
   * Extracts every piece of structured metadata from a page's HTML,
   * orchestrating all the individual extraction methods below into a
   * single ExtractedMetadata object. Parses `html` exactly once and
   * reuses that Document for every field below.
   */
  extractMetadata(input: ExtractMetadataInput): ExtractedMetadata {
    const doc = getDocument(input.html);
    const { internal, external } = classifyLinksFromDoc(doc, input.pageUrl);

    return {
      title: getTitleFromDoc(doc),
      metaDescription: getMetaDescriptionFromDoc(doc),
      canonicalUrl: getCanonicalFromDoc(doc, input.pageUrl),
      language: getLanguageFromDoc(doc),
      headings: getHeadingsFromDoc(doc),
      openGraph: getOpenGraphFromDoc(doc),
      twitterCard: getTwitterCardFromDoc(doc),
      structuredData: getStructuredDataFromDoc(doc),
      wordCount: getWordCountFromDoc(doc),
      imageCount: getImageCountFromDoc(doc),
      internalLinkCount: internal,
      externalLinkCount: external,
      favicon: getFaviconFromDoc(doc, input.pageUrl),
      viewport: getMeta(doc, "viewport"),
      robots: getMeta(doc, "robots"),
      charset: getCharsetFromDoc(doc),
      generator: getMeta(doc, "generator"),
      // HTML alone never carries this — it's an HTTP response header
      // (Last-Modified), which this pure parsing engine has no access to
      // (it never performs HTTP requests). A caller with access to the
      // actual response (e.g. Website Discovery Service, which already
      // fetches the page) would need to supply this separately if it's
      // ever needed; fabricating a value here would violate "extract
      // facts directly present in the markup."
      lastModified: null,
    };
  },

  /**
   * Extracts the page's <title> text.
   */
  extractTitle(html: string): string | null {
    return getTitleFromDoc(getDocument(html));
  },

  /**
   * Extracts the page's meta description.
   */
  extractMetaDescription(html: string): string | null {
    return getMetaDescriptionFromDoc(getDocument(html));
  },

  /**
   * Extracts the page's canonical URL, resolved to an absolute URL.
   */
  extractCanonical(html: string, pageUrl: string): string | null {
    return getCanonicalFromDoc(getDocument(html), pageUrl);
  },

  /**
   * Extracts the page's declared language.
   */
  extractLanguage(html: string): string | null {
    return getLanguageFromDoc(getDocument(html));
  },

  /**
   * Extracts every heading (h1–h6) on the page, in document order.
   */
  extractHeadings(html: string): Heading[] {
    return getHeadingsFromDoc(getDocument(html));
  },

  /**
   * Extracts Open Graph (og:*) meta tags.
   */
  extractOpenGraph(html: string): OpenGraph {
    return getOpenGraphFromDoc(getDocument(html));
  },

  /**
   * Extracts Twitter Card (twitter:*) meta tags.
   */
  extractTwitterCard(html: string): TwitterCard {
    return getTwitterCardFromDoc(getDocument(html));
  },

  /**
   * Extracts every structured data block on the page (JSON-LD, and
   * eventually microdata/RDFa).
   */
  extractStructuredData(html: string): StructuredData[] {
    return getStructuredDataFromDoc(getDocument(html));
  },

  /**
   * Counts the words in the page's visible text content.
   */
  countWords(html: string): number {
    return getWordCountFromDoc(getDocument(html));
  },

  /**
   * Counts the images on the page.
   */
  countImages(html: string): number {
    return getImageCountFromDoc(getDocument(html));
  },

  /**
   * Counts links pointing to the same origin as the page itself.
   */
  countInternalLinks(html: string, pageUrl: string): number {
    return classifyLinksFromDoc(getDocument(html), pageUrl).internal;
  },

  /**
   * Counts links pointing to a different origin than the page itself.
   */
  countExternalLinks(html: string, pageUrl: string): number {
    return classifyLinksFromDoc(getDocument(html), pageUrl).external;
  },
};
