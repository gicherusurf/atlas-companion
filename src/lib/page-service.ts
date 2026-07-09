import type {
  Page,
  CreatePageInput,
  UpdatePageInput,
  MarkCrawledInput,
  ListPagesFilter,
  PageSearchFilter,
} from "@/types/page";

// Atlas Page Repository.
//
// The canonical storage and query layer for every page Atlas discovers.
// The Crawl Engine writes pages here; every future SEO-adjacent module
// (SEO Audit, Keyword, Content, Competitor, Analytics) reads pages from
// here rather than from the Crawl Engine directly. The repository itself
// performs no crawling, no AI, and no SEO analysis — it only stores and
// queries page records.
//
// Follows the same architecture as the other Atlas services
// (`business-service.ts`, `crawl-service.ts`, `job-manager.ts`): a plain
// object of async methods, every method scoped by `businessId`, no mock
// data, `TODO(supabase)` markers instead of real persistence.
//
// This file must remain domain-neutral: no imports from Crawl Engine, SEO,
// Keyword, Content, Competitor, or Analytics modules. Those modules depend
// on the Page Repository — never the other way around.

function notImplemented(action: string): never {
  throw new Error(`PageService.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

export const pageService = {
  /**
   * Records a newly discovered page. Starts with crawlStatus: "discovered",
   * seoStatus: "pending", contentStatus: "none".
   */
  async createPage(_input: CreatePageInput): Promise<Page> {
    // TODO(supabase): supabase.from("pages").insert({
    //   business_id: input.businessId,
    //   url: input.url,
    //   ...input, // canonicalUrl, title, metaDescription, etc if provided
    //   crawl_status: "discovered",
    //   seo_status: "pending",
    //   content_status: "none",
    // }).select().single()
    return notImplemented("createPage");
  },

  /**
   * Fetches a single page by id, scoped to the business it belongs to.
   */
  async getPage(_businessId: string, _pageId: string): Promise<Page | null> {
    // TODO(supabase): supabase.from("pages").select("*")
    //   .eq("id", pageId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Fetches a single page by its URL, scoped to the business it belongs to.
   */
  async getPageByUrl(_businessId: string, _url: string): Promise<Page | null> {
    // TODO(supabase): supabase.from("pages").select("*")
    //   .eq("url", url).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists pages for a business, optionally filtered by crawl/SEO/content
   * status.
   */
  async listPages(_businessId: string, _filter?: ListPagesFilter): Promise<Page[]> {
    // TODO(supabase): supabase.from("pages").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("created_at", { ascending: false })
    return [];
  },

  /**
   * Free-text searches pages for a business (matched against
   * url/title/metaDescription), optionally combined with status filters.
   */
  async searchPages(_businessId: string, _filter: PageSearchFilter): Promise<Page[]> {
    // TODO(supabase): supabase.from("pages").select("*")
    //   .eq("business_id", businessId)
    //   .or(`url.ilike.%${filter.query}%,title.ilike.%${filter.query}%,meta_description.ilike.%${filter.query}%`)
    //   .match({ crawl_status: filter.crawlStatus, seo_status: filter.seoStatus, content_status: filter.contentStatus })
    return [];
  },

  /**
   * Patches on-page fields for a page (title, metaDescription, etc).
   * Status changes go through markCrawled/markSeoAnalyzed/markPublished
   * instead.
   */
  async updatePage(_businessId: string, _pageId: string, _input: UpdatePageInput): Promise<Page> {
    // TODO(supabase): supabase.from("pages").update(input)
    //   .eq("id", pageId).eq("business_id", businessId).select().single()
    return notImplemented("updatePage");
  },

  /**
   * Deletes a page record.
   */
  async deletePage(_businessId: string, _pageId: string): Promise<void> {
    // TODO(supabase): supabase.from("pages").delete()
    //   .eq("id", pageId).eq("business_id", businessId)
    return notImplemented("deletePage");
  },

  /**
   * Marks a page as crawled: sets crawlStatus to "crawled", stamps
   * lastCrawledAt, and stores whatever on-page data was extracted.
   * Intended to be called by the Crawl Engine after fetching a page.
   */
  async markCrawled(_businessId: string, _pageId: string, _input: MarkCrawledInput): Promise<Page> {
    // TODO(supabase): supabase.from("pages").update({
    //   ...input,
    //   crawl_status: "crawled",
    //   last_crawled_at: new Date().toISOString(),
    // }).eq("id", pageId).eq("business_id", businessId).select().single()
    return notImplemented("markCrawled");
  },

  /**
   * Marks a page's SEO analysis as complete: sets seoStatus to
   * "analyzed". Intended to be called by a future SEO Audit Engine.
   */
  async markSeoAnalyzed(_businessId: string, _pageId: string): Promise<Page> {
    // TODO(supabase): supabase.from("pages").update({ seo_status: "analyzed" })
    //   .eq("id", pageId).eq("business_id", businessId).select().single()
    return notImplemented("markSeoAnalyzed");
  },

  /**
   * Marks a page's content as published: sets contentStatus to
   * "published". Intended to be called by a future Content/Publishing
   * Engine.
   */
  async markPublished(_businessId: string, _pageId: string): Promise<Page> {
    // TODO(supabase): supabase.from("pages").update({ content_status: "published" })
    //   .eq("id", pageId).eq("business_id", businessId).select().single()
    return notImplemented("markPublished");
  },
};
