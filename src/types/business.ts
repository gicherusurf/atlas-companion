// TODO: once Supabase tables exist, generate/align these with the DB schema
// (e.g. via `supabase gen types typescript`) instead of hand-maintaining them.

/**
 * A single business (i.e. brand/company profile) within an organization.
 * An organization can own multiple businesses; each has its own Business
 * DNA (products, markets, competitors). `id` here is the `businessId`
 * referenced by every scoped entity below.
 */
export interface BusinessProfile {
  id: string;
  organizationId: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  mission: string | null;
  vision: string | null;
  primaryDomain?: string;
  primaryCountry?: string;
  primaryLanguage?: string;
  timezone?: string;
  currency?: string;
  updatedAt: string;
}

export type BusinessProfileInput = Omit<
  BusinessProfile,
  "id" | "organizationId" | "updatedAt"
>;

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  category: string | null;
}

export type ProductInput = Omit<Product, "id" | "businessId">;

export interface Market {
  id: string;
  businessId: string;
  name: string;
  region: string | null;
  notes: string | null;
}

export type MarketInput = Omit<Market, "id" | "businessId">;

/**
 * A strategic business competitor tracked as part of a business's
 * Business DNA. This is distinct from the SEO / Market Intelligence
 * "Competitors" module (search competitors, keyword rankings, backlinks),
 * which lives under the existing `/competitors` route.
 */
export interface BusinessCompetitor {
  id: string;
  businessId: string;
  name: string;
  website: string | null;
  notes: string | null;
}

export type BusinessCompetitorInput = Omit<BusinessCompetitor, "id" | "businessId">;
