import type {
  BusinessProfile,
  BusinessProfileInput,
  Product,
  ProductInput,
  Market,
  MarketInput,
  BusinessCompetitor,
  BusinessCompetitorInput,
} from "@/types/business";

// TODO(supabase): replace this whole module's implementation with real
// Supabase calls once the `businesses`, `business_products`,
// `business_markets`, and `business_competitors` tables exist.
// Expected shape, mirroring `src/lib/projects-api.ts`:
//   const { data, error } = await supabase
//     .from("business_products")
//     .select("*")
//     .eq("business_id", businessId);
//   if (error) throw error;
//   return data;
//
// Intentionally NOT returning mock data here — until Supabase is wired,
// list methods return empty results and mutations throw, so the UI fails
// loudly and visibly instead of pretending data exists.
//
// Multi-business note: an organization can own multiple businesses, each
// with its own Business DNA. Every CRUD method below is scoped by
// `businessId` so this holds even though, for now, the UI only ever
// manages a single selected business (org/business switching is a
// separate, not-yet-implemented concern).

function notImplemented(action: string): never {
  throw new Error(
    `BusinessService.${action} is not implemented yet — TODO(supabase): wire this up.`,
  );
}

export const businessService = {
  // --- Businesses (an org can own many) --------------------------------
  async listBusinesses(organizationId: string): Promise<BusinessProfile[]> {
    // TODO(supabase): supabase.from("businesses").select("*").eq("organization_id", organizationId)
    return [];
  },

  async getBusiness(businessId: string): Promise<BusinessProfile | null> {
    // TODO(supabase): supabase.from("businesses").select("*").eq("id", businessId).maybeSingle()
    return null;
  },

  async createBusiness(
    organizationId: string,
    _input: BusinessProfileInput,
  ): Promise<BusinessProfile> {
    // TODO(supabase): supabase.from("businesses").insert({ organization_id: organizationId, ...input }).select().single()
    return notImplemented("createBusiness");
  },

  async updateBusiness(businessId: string, _input: BusinessProfileInput): Promise<BusinessProfile> {
    // TODO(supabase): supabase.from("businesses").update(input).eq("id", businessId).select().single()
    return notImplemented("updateBusiness");
  },

  async deleteBusiness(businessId: string): Promise<void> {
    // TODO(supabase): supabase.from("businesses").delete().eq("id", businessId)
    return notImplemented("deleteBusiness");
  },

  // --- Products (scoped to a business) ---------------------------------
  async listProducts(businessId: string): Promise<Product[]> {
    // TODO(supabase): supabase.from("business_products").select("*").eq("business_id", businessId).order("name")
    return [];
  },

  async createProduct(businessId: string, _input: ProductInput): Promise<Product> {
    // TODO(supabase): supabase.from("business_products").insert({ business_id: businessId, ...input }).select().single()
    return notImplemented("createProduct");
  },

  async updateProduct(businessId: string, _id: string, _input: ProductInput): Promise<Product> {
    // TODO(supabase): supabase.from("business_products").update(input).eq("id", id).eq("business_id", businessId).select().single()
    return notImplemented("updateProduct");
  },

  async deleteProduct(businessId: string, _id: string): Promise<void> {
    // TODO(supabase): supabase.from("business_products").delete().eq("id", id).eq("business_id", businessId)
    return notImplemented("deleteProduct");
  },

  // --- Markets (scoped to a business) -----------------------------------
  async listMarkets(businessId: string): Promise<Market[]> {
    // TODO(supabase): supabase.from("business_markets").select("*").eq("business_id", businessId).order("name")
    return [];
  },

  async createMarket(businessId: string, _input: MarketInput): Promise<Market> {
    // TODO(supabase): supabase.from("business_markets").insert({ business_id: businessId, ...input }).select().single()
    return notImplemented("createMarket");
  },

  async updateMarket(businessId: string, _id: string, _input: MarketInput): Promise<Market> {
    // TODO(supabase): supabase.from("business_markets").update(input).eq("id", id).eq("business_id", businessId).select().single()
    return notImplemented("updateMarket");
  },

  async deleteMarket(businessId: string, _id: string): Promise<void> {
    // TODO(supabase): supabase.from("business_markets").delete().eq("id", id).eq("business_id", businessId)
    return notImplemented("deleteMarket");
  },

  // --- Competitors (scoped to a business — strategic business competitors,
  // NOT the SEO/Market Intelligence "Competitors" module) -----------------
  async listCompetitors(businessId: string): Promise<BusinessCompetitor[]> {
    // TODO(supabase): supabase.from("business_competitors").select("*").eq("business_id", businessId).order("name")
    return [];
  },

  async createCompetitor(
    businessId: string,
    _input: BusinessCompetitorInput,
  ): Promise<BusinessCompetitor> {
    // TODO(supabase): supabase.from("business_competitors").insert({ business_id: businessId, ...input }).select().single()
    return notImplemented("createCompetitor");
  },

  async updateCompetitor(
    businessId: string,
    _id: string,
    _input: BusinessCompetitorInput,
  ): Promise<BusinessCompetitor> {
    // TODO(supabase): supabase.from("business_competitors").update(input).eq("id", id).eq("business_id", businessId).select().single()
    return notImplemented("updateCompetitor");
  },

  async deleteCompetitor(businessId: string, _id: string): Promise<void> {
    // TODO(supabase): supabase.from("business_competitors").delete().eq("id", id).eq("business_id", businessId)
    return notImplemented("deleteCompetitor");
  },
};
