import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
  Page,
  PageStatus,
  SEOStatus,
  ContentStatus,
  CreatePageInput,
  UpdatePageInput,
  MarkCrawledInput,
  ListPagesFilter,
  PageSearchFilter,
} from "@/types/page";

// Atlas Page Repository — production implementation.
//
// The canonical storage and query layer for every page Atlas discovers.
// The Crawl Engine writes pages here; every future SEO-adjacent module
// (SEO Audit, Keyword, Content, Competitor, Analytics) reads pages from
// here rather than from the Crawl Engine directly. The repository itself
// performs no crawling, no AI, and no SEO analysis — it only stores and
// queries page records. No business logic lives in this file — every
// method is a direct, thin mapping onto a single Supabase table.
//
// PERSISTENCE: backed by exactly one table, `public.pages` (see
// `supabase/migrations/20260714000000_create_pages_table.sql`). Every
// query is scoped by `business_id` — there is no method in this file
// that reads or writes a row without an `.eq("business_id", businessId)`
// clause, matching the multi-business architecture the rest of Atlas is
// built on.
//
// Uses Atlas's one canonical Supabase client
// (`src/integrations/supabase/client.ts`) — this file does not, and must
// not, create its own client.
//
// ERROR HANDLING: never throws for "no rows found" — that's a normal,
// expected outcome (`getPage`/`getPageByUrl` return `null`; `listPages`/
// `searchPages` return `[]`). It DOES throw for a genuine Supabase error
// (a real query/connection/permission failure), with a message identifying
// which method failed — "only throw for genuine persistence failures,"
// not for the absence of data.

/** The shape of a `pages` row exactly as Postgres/PostgREST returns it. */
interface PageRow {
  id: string;
  business_id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  meta_description: string | null;
  language: string | null;
  status_code: number | null;
  content_type: string | null;
  h1: string | null;
  word_count: number | null;
  crawl_status: PageStatus;
  seo_status: SEOStatus;
  content_status: ContentStatus;
  last_crawled_at: string | null;
  last_modified: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

const TABLE = "pages";

// --- Reusable query/mapping helpers ---------------------------------------
// Kept small and single-purpose, per "create reusable query helpers,
// avoid duplicated Supabase queries."

/** Maps a raw `pages` row (snake_case) onto Atlas's `Page` type (camelCase). */
function mapRowToPage(row: PageRow): Page {
  return {
    id: row.id,
    businessId: row.business_id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    metaDescription: row.meta_description,
    language: row.language,
    statusCode: row.status_code,
    contentType: row.content_type,
    h1: row.h1,
    wordCount: row.word_count,
    crawlStatus: row.crawl_status,
    seoStatus: row.seo_status,
    contentStatus: row.content_status,
    lastCrawledAt: row.last_crawled_at,
    lastModified: row.last_modified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ?? {},
  };
}

/**
 * The mutable, on-page fields every write method accepts (structurally
 * matches `CreatePageInput`/`UpdatePageInput`/`MarkCrawledInput` — all
 * three are this same set of ten fields, per `src/types/page.ts`'s own
 * `PageContentFields`). Kept as a local structural type here rather than
 * importing `PageContentFields` itself, since that type is intentionally
 * not exported from `page.ts` — every caller already only ever supplies
 * one of the three public input types, which this matches structurally.
 */
type ContentFieldsInput = {
  canonicalUrl?: string | null;
  title?: string | null;
  metaDescription?: string | null;
  language?: string | null;
  statusCode?: number | null;
  contentType?: string | null;
  h1?: string | null;
  wordCount?: number | null;
  lastModified?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Maps whichever content fields are actually present on `input` onto
 * their `pages` row column names — only keys that are explicitly present
 * are included, so a partial update never overwrites an unrelated column
 * with `undefined`/null-by-omission.
 */
function contentFieldsToRow(input: ContentFieldsInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("canonicalUrl" in input) row.canonical_url = input.canonicalUrl;
  if ("title" in input) row.title = input.title;
  if ("metaDescription" in input) row.meta_description = input.metaDescription;
  if ("language" in input) row.language = input.language;
  if ("statusCode" in input) row.status_code = input.statusCode;
  if ("contentType" in input) row.content_type = input.contentType;
  if ("h1" in input) row.h1 = input.h1;
  if ("wordCount" in input) row.word_count = input.wordCount;
  if ("lastModified" in input) row.last_modified = input.lastModified;
  if ("metadata" in input) row.metadata = input.metadata;
  return row;
}

/**
 * Throws a structured, method-attributed error for a genuine Supabase
 * error — the ONLY place this file throws for a persistence reason. Never
 * called for "no rows" (`data: null, error: null`), only for a real
 * `error` object.
 */
function throwOnError(error: PostgrestError, context: string): never {
  throw new Error(`PageService.${context}: ${error.message}`);
}

/** Escapes SQL LIKE/ILIKE wildcard characters in raw user search input. */
function escapeLikeWildcards(term: string): string {
  return term.replace(/[%_]/g, (match) => `\\${match}`);
}

/**
 * Escapes a value for embedding inside a PostgREST `.or()` filter string,
 * per PostgREST's documented quoting rules: a value containing filter
 * syntax characters must be wrapped in double quotes, with any embedded
 * backslash or double quote itself backslash-escaped.
 */
function quoteOrFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Builds the `.or(...)` filter string for searchPages()'s multi-column
 * ILIKE search — one place this is constructed, so the escaping rules
 * above are applied consistently rather than repeated per column.
 */
function buildSearchOrFilter(query: string): string {
  const pattern = quoteOrFilterValue(`%${escapeLikeWildcards(query)}%`);
  return `url.ilike.${pattern},title.ilike.${pattern},meta_description.ilike.${pattern}`;
}

/**
 * Applies the three optional status filters shared by `listPages()` and
 * `searchPages()` to a query — written once, used by both, rather than
 * duplicating the same three `if` checks in each method.
 */
function applyStatusFilters<Q extends { eq: (column: string, value: unknown) => Q }>(
  query: Q,
  filter: ListPagesFilter | undefined,
): Q {
  let result = query;
  if (filter?.crawlStatus) result = result.eq("crawl_status", filter.crawlStatus);
  if (filter?.seoStatus) result = result.eq("seo_status", filter.seoStatus);
  if (filter?.contentStatus) result = result.eq("content_status", filter.contentStatus);
  return result;
}

export const pageService = {
  /**
   * Records a newly discovered page. Starts with crawlStatus: "discovered",
   * seoStatus: "pending", contentStatus: "none". If a page already exists
   * for this business+url (the `pages_business_id_url_key` unique
   * constraint), returns that existing page rather than overwriting it or
   * throwing.
   */
  async createPage(input: CreatePageInput): Promise<Page> {
    const row = {
      business_id: input.businessId,
      url: input.url,
      crawl_status: "discovered" as const,
      seo_status: "pending" as const,
      content_status: "none" as const,
      ...contentFieldsToRow(input),
    };

    const { data, error } = await supabase.from(TABLE).insert(row).select().single();

    if (error) {
      // Postgres unique_violation — a page for this business+url already
      // exists. Per spec: return the existing page, don't overwrite it.
      if (error.code === "23505") {
        const existing = await this.getPageByUrl(input.businessId, input.url);
        if (existing) return existing;
      }
      throwOnError(error, "createPage");
    }

    return mapRowToPage(data as PageRow);
  },

  /**
   * Fetches a single page by id, scoped to the business it belongs to.
   */
  async getPage(businessId: string, pageId: string): Promise<Page | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", pageId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throwOnError(error, "getPage");
    return data ? mapRowToPage(data as PageRow) : null;
  },

  /**
   * Fetches a single page by its URL, scoped to the business it belongs to.
   */
  async getPageByUrl(businessId: string, url: string): Promise<Page | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("url", url)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throwOnError(error, "getPageByUrl");
    return data ? mapRowToPage(data as PageRow) : null;
  },

  /**
   * Lists pages for a business, optionally filtered by crawl/SEO/content
   * status.
   */
  async listPages(businessId: string, filter?: ListPagesFilter): Promise<Page[]> {
    const query = applyStatusFilters(
      supabase.from(TABLE).select("*").eq("business_id", businessId),
      filter,
    ).order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throwOnError(error, "listPages");
    return (data ?? []).map((row) => mapRowToPage(row as PageRow));
  },

  /**
   * Free-text searches pages for a business (matched against
   * url/title/metaDescription via ILIKE), optionally combined with status
   * filters.
   */
  async searchPages(businessId: string, filter: PageSearchFilter): Promise<Page[]> {
    const query = applyStatusFilters(
      supabase.from(TABLE).select("*").eq("business_id", businessId).or(buildSearchOrFilter(filter.query)),
      filter,
    );

    const { data, error } = await query;
    if (error) throwOnError(error, "searchPages");
    return (data ?? []).map((row) => mapRowToPage(row as PageRow));
  },

  /**
   * Patches on-page fields for a page (title, metaDescription, etc).
   * Never touches id/businessId/createdAt — only the mutable content
   * fields are ever included in the update payload. Status changes go
   * through markCrawled/markSeoAnalyzed/markPublished instead.
   */
  async updatePage(businessId: string, pageId: string, input: UpdatePageInput): Promise<Page> {
    const row = { ...contentFieldsToRow(input), updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", pageId)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throwOnError(error, "updatePage");
    return mapRowToPage(data as PageRow);
  },

  /**
   * Deletes a page record.
   */
  async deletePage(businessId: string, pageId: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq("id", pageId).eq("business_id", businessId);
    if (error) throwOnError(error, "deletePage");
  },

  /**
   * Marks a page as crawled: sets crawlStatus to "crawled", stamps
   * lastCrawledAt, and stores whatever on-page data was extracted.
   * Intended to be called by the Crawl Engine after fetching a page.
   */
  async markCrawled(businessId: string, pageId: string, input: MarkCrawledInput): Promise<Page> {
    const row = {
      ...contentFieldsToRow(input),
      crawl_status: "crawled" as const,
      last_crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", pageId)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throwOnError(error, "markCrawled");
    return mapRowToPage(data as PageRow);
  },

  /**
   * Marks a page's SEO analysis as complete: sets seoStatus to
   * "analyzed". Intended to be called by a future SEO Audit Engine.
   */
  async markSeoAnalyzed(businessId: string, pageId: string): Promise<Page> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ seo_status: "analyzed", updated_at: new Date().toISOString() })
      .eq("id", pageId)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throwOnError(error, "markSeoAnalyzed");
    return mapRowToPage(data as PageRow);
  },

  /**
   * Marks a page's content as published: sets contentStatus to
   * "published". Intended to be called by a future Content/Publishing
   * Engine.
   */
  async markPublished(businessId: string, pageId: string): Promise<Page> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ content_status: "published", updated_at: new Date().toISOString() })
      .eq("id", pageId)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throwOnError(error, "markPublished");
    return mapRowToPage(data as PageRow);
  },
};
