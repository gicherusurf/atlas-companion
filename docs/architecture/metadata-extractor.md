# Atlas Metadata Extraction Engine

## Purpose

The Metadata Extraction Engine converts raw HTML into structured page
metadata. It is a **pure parsing engine**: given `(html, pageUrl)`, it
returns facts that are directly present in the markup. It never performs
HTTP requests, never queries Supabase, and never imports the Crawl
Engine — it has no knowledge of how the HTML it's given arrived, only of
what that HTML says. It performs no SEO analysis, scoring, or
recommendations of any kind.

This document covers the production implementation — every method
previously documented with a `TODO(parser)` placeholder is now fully
implemented, with the same public API and same file
(`src/lib/metadata-extractor.ts`) as before.

## Architecture

**Parser:** the browser's native `DOMParser`, exclusively — no
third-party HTML library. `DOMParser.parseFromString(html, "text/html")`
is defined by the HTML spec to always produce *some* document, even for
badly malformed markup, which is a large part of why this engine can
honestly guarantee it never throws.

**Two layers of functions, one implementation per concern:**

- **Core `*FromDoc` functions** (private) — `getTitleFromDoc`,
  `getMetaDescriptionFromDoc`, `getCanonicalFromDoc`,
  `getLanguageFromDoc`, `getHeadingsFromDoc`, `getOpenGraphFromDoc`,
  `getTwitterCardFromDoc`, `getStructuredDataFromDoc`,
  `getWordCountFromDoc`, `getImageCountFromDoc`, `classifyLinksFromDoc`,
  plus a few `extractMetadata()`-only ones (`getFaviconFromDoc`,
  `getCharsetFromDoc`). Each operates on an already-parsed `Document`.
- **Public methods** (`extractTitle`, `extractHeadings`, `countWords`,
  etc.) each parse their own `Document` via `getDocument(html)` and
  delegate straight to the matching core function.

This is what "never duplicate DOM queries" means in practice: there is
exactly **one** implementation of, say, "how do I find the canonical
link" (`getCanonicalFromDoc`) — both the standalone `extractCanonical()`
method and `extractMetadata()`'s internal orchestration call the same
function. Nothing is implemented twice.

**Shared low-level helpers:** `getDocument()`, `getMeta()` (reads a
`<meta name="...">`'s content, case-insensitively), `getProperty()`
(reads a `<meta property="...">`, falling back to `name="..."` — for
Open Graph tags), `resolveUrl()` (relative → absolute, via `new
URL(href, base)`), `cleanText()` (collapses whitespace, trims, returns
null instead of an empty string), and `isInternalLink()` (same-origin
check, returning `null` — meaning "ignore this link" — for unparseable
URLs or `mailto:`/`tel:`/`javascript:` schemes, rather than guessing).

## Extraction Flow

```
extractMetadata({ html, pageUrl })
        │
        ▼
   getDocument(html)          <- parses ONCE
        │
        ├──▶ getTitleFromDoc(doc)
        ├──▶ getMetaDescriptionFromDoc(doc)
        ├──▶ getCanonicalFromDoc(doc, pageUrl)
        ├──▶ getLanguageFromDoc(doc)
        ├──▶ getHeadingsFromDoc(doc)
        ├──▶ getOpenGraphFromDoc(doc)
        ├──▶ getTwitterCardFromDoc(doc)
        ├──▶ getStructuredDataFromDoc(doc)
        ├──▶ getWordCountFromDoc(doc)
        ├──▶ getImageCountFromDoc(doc)
        ├──▶ classifyLinksFromDoc(doc, pageUrl)  <- one pass, both counts
        ├──▶ getFaviconFromDoc(doc, pageUrl)
        ├──▶ getMeta(doc, "viewport"/"robots"/"generator")
        └──▶ getCharsetFromDoc(doc)
        │
        ▼
   ExtractedMetadata
```

Every standalone public method (`extractTitle(html)`, `countWords(html)`,
etc.) follows the same `getDocument(html) → *FromDoc(doc)` shape
independently, for its own single field — see Performance below for why
that's fine for those methods specifically, but not for
`extractMetadata()`.

## Supported Metadata

| Field | Source |
|---|---|
| `title` | `<title>` |
| `metaDescription` | `<meta name="description">` |
| `canonicalUrl` | `<link rel="canonical">`, resolved to absolute |
| `language` | `<html lang="...">`, falling back to `<meta http-equiv="content-language">` |
| `headings` | Every `<h1>`–`<h6>`, in document order, empty ones skipped |
| `openGraph` | `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `og:locale` |
| `twitterCard` | `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:site`, `twitter:creator` |
| `structuredData` | Every `<script type="application/ld+json">` (see below) |
| `wordCount` | Visible text, excluding `script`/`style`/`noscript`/`template` |
| `imageCount` | Every `<img>` |
| `internalLinkCount` / `externalLinkCount` | Every `<a href>`, classified by origin (see below) |
| `favicon` | `<link rel="icon">` or `<link rel="shortcut icon">`, resolved to absolute |
| `viewport` | `<meta name="viewport">` |
| `robots` | `<meta name="robots">` |
| `charset` | `<meta charset>`, falling back to `<meta http-equiv="Content-Type">`'s `charset=` parameter |
| `generator` | `<meta name="generator">` |
| `lastModified` | **Always `null`** — see the note in `extractMetadata()`'s own code comment: this is an HTTP response header, not something HTML markup can carry, and this engine never performs HTTP requests to have access to it |

**Link classification** ignores `mailto:`, `tel:`, and `javascript:`
hrefs entirely (neither internal nor external) and never throws on a
malformed `href` — it's simply excluded from both counts. A relative
`href` is resolved against `pageUrl` before its origin is compared;
per the URL specification, an empty or whitespace-only `href` resolves
to `pageUrl` itself and is therefore (correctly) counted as internal —
this was verified against a real browser engine, not assumed.

## Structured Data

Every `<script type="application/ld+json">` produces **one
`StructuredData` entry per block** (not per JSON object within a block —
a block containing an array or a `@graph` still yields one entry). If a
block's content fails `JSON.parse()`, that block is skipped silently;
it never throws and never prevents other blocks (or the rest of
`extractMetadata()`) from being processed. `type` is read from the
parsed value's `@type` — handling a plain object, an array of objects
(using the first item), and a `@graph` array (using its first item) —
falling back to `null` if none of those shapes match, rather than
guessing.

## Performance

`extractMetadata()` parses `html` into a `Document` **exactly once** and
passes that single `Document` to every `*FromDoc` core function — none
of its 17 output fields trigger a second parse. `internalLinkCount` and
`externalLinkCount` in particular come from one shared
`classifyLinksFromDoc()` call that walks the anchor list once and
resolves each `href` once, rather than the two separate walks a naive
implementation of "count internal" and "count external" might do.

The standalone public methods (`extractTitle`, `extractHeadings`, etc.)
each still parse their own fresh `Document` — this is intentional, not
an oversight: they're designed to be independently callable (e.g. for
unit testing one field in isolation) and there's no `Document` to reuse
across separate top-level calls. The "parse once" guarantee is
specifically about `extractMetadata()`'s single invocation, not about
caching parses across unrelated calls.

## Future Server-side Parsing

`DOMParser` runs synchronously, in-memory, on whatever HTML string it's
given — for a very large page (a multi-megabyte listing page, for
example), this means the full document tree is built and held in memory
for the duration of the call. If that ever becomes a real constraint (a
crawl encountering unusually large pages, or running this extraction at
high volume), the intended fix is **not** to change this file's public
API — every method here would keep its exact current signature — but to
introduce a server-side variant (e.g. a Supabase Edge Function or a
Node-based worker using a streaming HTML parser) that this same
`metadataExtractor` object could delegate to for oversized inputs, while
small/typical pages continue through `DOMParser` unchanged. That
decision point doesn't exist yet; this is deliberately left as a future
seam, not a present concern — `DOMParser` is the correct, simplest choice
for the page sizes Atlas handles today.
