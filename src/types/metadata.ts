/**
 * A single heading found on a page (h1–h6).
 */
export interface Heading {
  /** 1–6, corresponding to h1–h6. */
  level: number;
  text: string;
}

/**
 * Open Graph metadata found on a page (og:* meta tags).
 */
export interface OpenGraph {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  siteName: string | null;
  locale: string | null;
}

/**
 * Twitter Card metadata found on a page (twitter:* meta tags).
 */
export interface TwitterCard {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  creator: string | null;
  site: string | null;
}

/**
 * A single structured data block found on a page (e.g. one JSON-LD
 * <script> tag, or one microdata/RDFa item).
 */
export interface StructuredData {
  /** The schema.org (or other vocabulary) type, e.g. "Article", "Product". */
  type: string | null;
  format: "json-ld" | "microdata" | "rdfa" | null;
  /** The raw, unparsed source of this block, kept for downstream re-parsing. */
  raw: string;
}

/**
 * The full set of structured information extracted from a single page's
 * raw HTML. This is the Metadata Extraction Engine's sole output — it
 * contains no SEO scoring, grading, or recommendations of any kind, only
 * facts extracted directly from the markup.
 *
 * Note: `structuredData` is an array rather than a single `StructuredData`
 * value, since a real page commonly carries more than one structured data
 * block (e.g. an Organization JSON-LD block plus a BreadcrumbList block).
 */
export interface ExtractedMetadata {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  headings: Heading[];
  openGraph: OpenGraph;
  twitterCard: TwitterCard;
  structuredData: StructuredData[];
  wordCount: number;
  imageCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  favicon: string | null;
  viewport: string | null;
  robots: string | null;
  charset: string | null;
  generator: string | null;
  lastModified: string | null;
}

/**
 * Input to `metadataExtractor.extractMetadata()` and to the link-counting
 * methods. `pageUrl` is needed (not just `html`) so relative URLs (in
 * `<link rel="canonical">`, `<a href>`, etc.) can be resolved to absolute
 * ones, and so links can be classified as internal vs. external relative
 * to the page's own origin.
 */
export interface ExtractMetadataInput {
  html: string;
  pageUrl: string;
}
