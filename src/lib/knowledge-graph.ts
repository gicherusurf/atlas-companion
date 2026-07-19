import { supabase } from "@/lib/infrastructure/supabase";
import { pageService } from "@/lib/page-service";
import type { Page } from "@/types/page";
import type { ExtractedMetadata } from "@/types/metadata";
import type {
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeRelationship,
  RelationshipType,
  KnowledgeGraph,
  FindEntitiesFilter,
  FindRelationshipsFilter,
} from "@/types/knowledge";

// Atlas Knowledge Graph Engine — production implementation.
//
// Transforms structured page metadata into business knowledge: it
// identifies business entities and the relationships between them. This
// engine does NOT perform SEO analysis and does NOT generate
// recommendations — it only builds knowledge. It is entirely
// deterministic: rules and regexes only, no AI/LLM calls anywhere in
// this file (see "Future AI Enrichment" in
// docs/architecture/knowledge-graph.md for where that would eventually
// plug in without changing this file's public API).
//
// REUSE, NOT DUPLICATION:
//   - Page Repository (`pageService`) — buildKnowledgeGraph()'s source
//     of pages for a business; this file never crawls or fetches HTML
//     itself.
//   - Metadata Extractor's OUTPUT TYPE (`ExtractedMetadata`) — this file
//     consumes that shape as input; it never parses HTML itself.
//   - Atlas's one canonical Supabase client
//     (`src/lib/infrastructure/supabase.ts`) — entities/relationships are
//     persisted to two new tables (see
//     `supabase/migrations/20260714010000_create_knowledge_graph_tables.sql`),
//     with no second client created.
//   - Rule Engine and Event Bus are reused in name only, per the brief —
//     "future only." This file has no import of either yet.
//
// ENTITY TYPES: `KnowledgeEntityType` is NOT modified by this
// implementation — "use the existing enum" is honored literally. A few
// of the entity types this brief describes (Website, Category, Article,
// FAQ, Breadcrumb) have no exact match in the existing 18-value enum;
// each is mapped onto the closest existing type instead of inventing a
// new one — see `JSONLD_TYPE_MAP` and `extractBreadcrumbEntities()`
// below for exactly how, and `docs/architecture/knowledge-graph.md`'s
// "Entity Extraction" section for the full mapping table.
//
// PAGE REPOSITORY LIMITATION, STATED HONESTLY: `Page` (what Page
// Repository persists) is a flattened subset of `ExtractedMetadata` — it
// has no `headings[]` beyond a single `h1`, no `openGraph`/`twitterCard`
// objects, and no `structuredData[]`. `buildKnowledgeGraph()` (which
// reconstructs the pages of a business from Page Repository alone) can
// therefore only realistically extract from title/metaDescription/h1/
// canonicalUrl for pages it processes this way. `extractEntities()`
// itself has no such limitation — a caller with real `ExtractedMetadata`
// in hand (e.g. a future Crawl Engine step calling this immediately
// after `metadataExtractor.extractMetadata()`, before that richer data
// is discarded) gets full JSON-LD/OpenGraph/TwitterCard extraction. This
// is documented in detail in `docs/architecture/knowledge-graph.md`.

const ENTITIES_TABLE = "knowledge_entities";
const RELATIONSHIPS_TABLE = "knowledge_relationships";

interface EntityRow {
  id: string;
  business_id: string;
  type: KnowledgeEntityType;
  name: string;
  normalized_name: string;
  description: string | null;
  source_page_id: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface RelationshipRow {
  id: string;
  business_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship: RelationshipType;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Confidence scoring model — how strongly each source of extraction is
 * trusted. Higher-fidelity, more structured sources score higher.
 * Documented in full in docs/architecture/knowledge-graph.md's
 * "Confidence Model" section.
 */
const CONFIDENCE = {
  jsonLd: 0.98,
  openGraph: 0.95,
  title: 0.85,
  heading: 0.75,
  metaDescription: 0.7,
  /**
   * Reserved for the weakest deterministic signals. Metadata Extractor's
   * output has no raw page-body text field to extract from, so this tier
   * is used here specifically for the canonical-URL-domain fallback
   * Organization (the lowest-confidence, last-resort signal this engine
   * produces) rather than for literal "body text."
   */
  body: 0.6,
} as const;

// --- Generic private helpers ----------------------------------------------

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `kg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Lowercases, strips diacritics/punctuation, and collapses whitespace — used both when building entities and when matching them for dedup in mergeEntities(). */
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\+?\d[\d\s().-]{7,14}\d/g;
const URL_REGEX = /https?:\/\/[^\s"'<>]+/g;

function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

function extractPhones(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) ?? [];
  // Require at least 7 digits to cut down on false positives (dates, IDs).
  return Array.from(
    new Set(matches.map((m) => m.trim()).filter((m) => (m.match(/\d/g) ?? []).length >= 7)),
  );
}

function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(new Set(text.match(URL_REGEX) ?? []));
}

/** Shallow-merges two metadata bags, concatenating+deduping any array-valued keys present on both (e.g. `sourcePageIds`) instead of one clobbering the other. */
function mergeMetadata(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const key of Object.keys(a)) {
    if (Array.isArray(a[key]) && Array.isArray(b[key])) {
      merged[key] = Array.from(new Set([...(a[key] as unknown[]), ...(b[key] as unknown[])]));
    }
  }
  return merged;
}

function makeEntity(params: {
  businessId: string;
  type: KnowledgeEntityType;
  name: string;
  description?: string | null;
  sourcePageId: string | null;
  confidence: number;
  metadata?: Record<string, unknown>;
}): KnowledgeEntity {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    businessId: params.businessId,
    type: params.type,
    name: params.name,
    description: params.description ?? null,
    sourcePageId: params.sourcePageId,
    confidence: params.confidence,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

function makeRelationship(params: {
  businessId: string;
  source: KnowledgeEntity;
  target: KnowledgeEntity;
  relationship: RelationshipType;
  confidence: number;
  metadata?: Record<string, unknown>;
}): KnowledgeRelationship {
  return {
    id: generateId(),
    businessId: params.businessId,
    sourceEntityId: params.source.id,
    targetEntityId: params.target.id,
    relationship: params.relationship,
    confidence: params.confidence,
    metadata: params.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

function mapRowToEntity(row: EntityRow): KnowledgeEntity {
  return {
    id: row.id,
    businessId: row.business_id,
    type: row.type,
    name: row.name,
    description: row.description,
    sourcePageId: row.source_page_id,
    confidence: row.confidence,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToRelationship(row: RelationshipRow): KnowledgeRelationship {
  return {
    id: row.id,
    businessId: row.business_id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    relationship: row.relationship,
    confidence: row.confidence,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Reconstructs an ExtractedMetadata-*shaped* object from a persisted
 * `Page` alone — used only by `buildKnowledgeGraph()`, which has no
 * access to a page's original raw HTML (Page Repository doesn't store
 * the richer fields). See the file-level "PAGE REPOSITORY LIMITATION"
 * comment above for why this is necessarily a partial reconstruction.
 */
function pageToMinimalExtractedMetadata(page: Page): ExtractedMetadata {
  return {
    title: page.title,
    metaDescription: page.metaDescription,
    canonicalUrl: page.canonicalUrl,
    language: page.language,
    headings: page.h1 ? [{ level: 1, text: page.h1 }] : [],
    openGraph: { title: null, description: null, image: null, url: null, type: null, siteName: null, locale: null },
    twitterCard: { card: null, title: null, description: null, image: null, creator: null, site: null },
    structuredData: [],
    wordCount: page.wordCount ?? 0,
    imageCount: 0,
    internalLinkCount: 0,
    externalLinkCount: 0,
    favicon: null,
    viewport: null,
    robots: null,
    charset: null,
    generator: null,
    lastModified: page.lastModified,
  };
}

// --- JSON-LD helpers -------------------------------------------------------

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Malformed JSON-LD on one page must never break extraction for the
    // rest of that page (or any other page) — skip it, never throw.
    return null;
  }
}

/** Flattens a parsed JSON-LD value (a single item, an array of items, or an `@graph` wrapper) into a flat list of plain item objects. */
function flattenJsonLdItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((v) => flattenJsonLdItems(v));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) return flattenJsonLdItems(obj["@graph"]);
    return [obj];
  }
  return [];
}

function getJsonLdType(item: Record<string, unknown>): string | null {
  const t = item["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t) && typeof t[0] === "string") return t[0];
  return null;
}

/**
 * Maps a JSON-LD `@type` onto the existing `KnowledgeEntityType` enum.
 * Several of this engine's requested entity concepts (Website, Category,
 * Article, FAQ) have no exact match in that enum — mapped onto the
 * closest existing type below rather than extending the enum. Returns
 * null for `BreadcrumbList` (handled separately, see
 * `extractBreadcrumbEntities`) and for any unrecognized type.
 */
const JSONLD_TYPE_MAP: Record<string, KnowledgeEntityType> = {
  organization: "Organization",
  corporation: "Organization",
  localbusiness: "Organization",
  ngo: "Organization",
  product: "Product",
  service: "Service",
  person: "Person",
  brand: "Brand",
  // Article/FAQ have no dedicated entity type in the existing enum —
  // both are page-level content assets, so both map onto "Document".
  article: "Document",
  blogposting: "Document",
  newsarticle: "Document",
  faqpage: "Document",
  webpage: "Document",
};

function mapJsonLdType(rawType: string): KnowledgeEntityType | null {
  return JSONLD_TYPE_MAP[rawType.toLowerCase()] ?? null;
}

// --- Entity extraction, by source ------------------------------------------
// Each function is independent and single-purpose, per "avoid duplicate
// entity extraction, build once per page" — extractEntities() below
// calls each exactly once.

/** JSON-LD Organization/LocalBusiness/Corporation contact facts (telephone/email/address) nested one level deep. */
function extractOrganizationContactEntities(
  businessId: string,
  page: Page,
  item: Record<string, unknown>,
): KnowledgeEntity[] {
  const entities: KnowledgeEntity[] = [];

  if (typeof item.telephone === "string" && item.telephone.trim()) {
    entities.push(
      makeEntity({
        businessId,
        type: "Phone",
        name: item.telephone.trim(),
        sourcePageId: page.id,
        confidence: CONFIDENCE.jsonLd,
        metadata: { source: "json-ld" },
      }),
    );
  }
  if (typeof item.email === "string" && item.email.trim()) {
    entities.push(
      makeEntity({
        businessId,
        type: "Email",
        name: item.email.trim().toLowerCase(),
        sourcePageId: page.id,
        confidence: CONFIDENCE.jsonLd,
        metadata: { source: "json-ld" },
      }),
    );
  }

  const address = item.address;
  if (address && typeof address === "object") {
    const addr = address as Record<string, unknown>;
    if (typeof addr.addressLocality === "string" && addr.addressLocality.trim()) {
      entities.push(
        makeEntity({
          businessId,
          type: "City",
          name: addr.addressLocality.trim(),
          sourcePageId: page.id,
          confidence: CONFIDENCE.jsonLd,
          metadata: { source: "json-ld" },
        }),
      );
    }
    if (typeof addr.addressCountry === "string" && addr.addressCountry.trim()) {
      entities.push(
        makeEntity({
          businessId,
          type: "Country",
          name: addr.addressCountry.trim(),
          sourcePageId: page.id,
          confidence: CONFIDENCE.jsonLd,
          metadata: { source: "json-ld" },
        }),
      );
    }
  }

  return entities;
}

/**
 * `BreadcrumbList` JSON-LD has no dedicated entity type in the existing
 * enum (the brief's "Category"/"Breadcrumb" concepts) — each crumb
 * becomes a `Keyword` entity instead, which `extractRelationships()`
 * then links to any `Product` on the page via `belongs_to`.
 */
function extractBreadcrumbEntities(businessId: string, page: Page, item: Record<string, unknown>): KnowledgeEntity[] {
  const list = item.itemListElement;
  if (!Array.isArray(list)) return [];

  const entities: KnowledgeEntity[] = [];
  for (const crumb of list) {
    if (!crumb || typeof crumb !== "object") continue;
    const c = crumb as Record<string, unknown>;
    const nested = c.item && typeof c.item === "object" ? (c.item as Record<string, unknown>) : null;
    const crumbName = typeof c.name === "string" ? c.name : typeof nested?.name === "string" ? nested.name : null;
    if (crumbName && crumbName.trim()) {
      entities.push(
        makeEntity({
          businessId,
          type: "Keyword",
          name: crumbName.trim(),
          sourcePageId: page.id,
          confidence: CONFIDENCE.jsonLd,
          metadata: { source: "json-ld", jsonLdType: "BreadcrumbList" },
        }),
      );
    }
  }
  return entities;
}

/** Every JSON-LD `<script type="application/ld+json">` block — Organizations, Products, Services, People, Brands, Documents (Article/FAQ), and breadcrumb-derived Keywords. Confidence: `jsonLd` (0.98), the highest tier — structured data is the most explicit, least ambiguous signal available. */
function extractFromJsonLd(businessId: string, page: Page, metadata: ExtractedMetadata): KnowledgeEntity[] {
  const entities: KnowledgeEntity[] = [];

  for (const block of metadata.structuredData) {
    if (block.format !== "json-ld") continue;

    const parsed = safeParseJson(block.raw);
    if (parsed === null) continue;

    for (const item of flattenJsonLdItems(parsed)) {
      const rawType = getJsonLdType(item);
      if (!rawType) continue;

      if (rawType.toLowerCase() === "breadcrumblist") {
        entities.push(...extractBreadcrumbEntities(businessId, page, item));
        continue;
      }

      const entityType = mapJsonLdType(rawType);
      if (!entityType) continue;

      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) continue; // never throw — skip an entity without a usable name

      entities.push(
        makeEntity({
          businessId,
          type: entityType,
          name,
          description: typeof item.description === "string" ? item.description : null,
          sourcePageId: page.id,
          confidence: CONFIDENCE.jsonLd,
          metadata: { source: "json-ld", jsonLdType: rawType },
        }),
      );

      if (entityType === "Organization") {
        entities.push(...extractOrganizationContactEntities(businessId, page, item));
      }
    }
  }

  return entities;
}

/** Open Graph tags. `og:site_name` -> Organization; `og:type: "product"` + `og:title` -> Product. Confidence: `openGraph` (0.95). */
function extractFromOpenGraph(businessId: string, page: Page, metadata: ExtractedMetadata): KnowledgeEntity[] {
  const entities: KnowledgeEntity[] = [];
  const og = metadata.openGraph;

  if (og.siteName?.trim()) {
    entities.push(
      makeEntity({
        businessId,
        type: "Organization",
        name: og.siteName.trim(),
        sourcePageId: page.id,
        confidence: CONFIDENCE.openGraph,
        metadata: { source: "open-graph" },
      }),
    );
  }

  if (og.type?.toLowerCase() === "product" && og.title?.trim()) {
    entities.push(
      makeEntity({
        businessId,
        type: "Product",
        name: og.title.trim(),
        description: og.description,
        sourcePageId: page.id,
        confidence: CONFIDENCE.openGraph,
        metadata: { source: "open-graph", ogType: og.type },
      }),
    );
  }

  return entities;
}

/** Twitter Card handles (`twitter:site`, `twitter:creator`) -> SocialProfile entities. Confidence: same tier as Open Graph (0.95) — comparably structured, first-party metadata. */
function extractFromTwitterCard(businessId: string, page: Page, metadata: ExtractedMetadata): KnowledgeEntity[] {
  const entities: KnowledgeEntity[] = [];
  const tw = metadata.twitterCard;

  for (const handle of [tw.site, tw.creator]) {
    if (handle?.trim()) {
      entities.push(
        makeEntity({
          businessId,
          type: "SocialProfile",
          name: handle.trim(),
          sourcePageId: page.id,
          confidence: CONFIDENCE.openGraph,
          metadata: { source: "twitter-card" },
        }),
      );
    }
  }

  return entities;
}

/** Emails/phones found within a block of plain text (title, a heading, or the meta description) — the same deterministic regex extraction, reused at whichever confidence tier the calling text source warrants. */
function extractContactEntitiesFromText(
  businessId: string,
  page: Page,
  text: string | null | undefined,
  confidence: number,
  source: string,
): KnowledgeEntity[] {
  if (!text) return [];
  const entities: KnowledgeEntity[] = [];

  for (const email of extractEmails(text)) {
    entities.push(makeEntity({ businessId, type: "Email", name: email, sourcePageId: page.id, confidence, metadata: { source } }));
  }
  for (const phone of extractPhones(text)) {
    entities.push(makeEntity({ businessId, type: "Phone", name: phone, sourcePageId: page.id, confidence, metadata: { source } }));
  }

  return entities;
}

/**
 * A last-resort Organization, named from the page's own domain
 * (canonical URL, or its own URL if no canonical is set), used only when
 * nothing more specific (JSON-LD, Open Graph) already identified one.
 * This is this engine's lowest-confidence signal — the `body` tier — see
 * `CONFIDENCE.body`'s own comment for why it stands in for "body text"
 * here.
 */
function extractDomainFallbackOrganization(businessId: string, page: Page, alreadyHasOrganization: boolean): KnowledgeEntity[] {
  if (alreadyHasOrganization) return [];
  const source = page.canonicalUrl ?? page.url;
  if (!source) return [];

  try {
    const host = new URL(source).hostname.replace(/^www\./, "");
    const namePart = host.split(".")[0];
    if (!namePart) return [];
    const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    return [
      makeEntity({
        businessId,
        type: "Organization",
        name,
        sourcePageId: page.id,
        confidence: CONFIDENCE.body,
        metadata: { source: "canonical-url-domain", domain: host },
      }),
    ];
  } catch {
    return [];
  }
}

// --- Relationship inference -------------------------------------------------

function byType(entities: KnowledgeEntity[], type: KnowledgeEntityType): KnowledgeEntity[] {
  return entities.filter((e) => e.type === type);
}

/**
 * Infers relationships from which entity TYPES co-occurred on a single
 * page — deterministic, structural co-occurrence only, no NLP. Baseline
 * confidence here (0.65) is intentionally moderate: a single page
 * co-occurrence is a real but not certain signal. See
 * `upsertRelationship()` in `buildKnowledgeGraph()`'s persistence path
 * for how confidence is boosted when multiple pages independently
 * support the same relationship.
 */
function inferRelationshipsForPage(
  businessId: string,
  entities: KnowledgeEntity[],
): KnowledgeRelationship[] {
  const BASELINE = 0.65;
  const relationships: KnowledgeRelationship[] = [];

  const organizations = byType(entities, "Organization");
  const companies = byType(entities, "Company");
  const services = byType(entities, "Service");
  const products = byType(entities, "Product");
  const brands = byType(entities, "Brand");
  const documents = byType(entities, "Document");
  const keywords = byType(entities, "Keyword");
  const locations = [...byType(entities, "Location"), ...byType(entities, "City"), ...byType(entities, "Country")];
  const emails = byType(entities, "Email");
  const phones = byType(entities, "Phone");
  const socialProfiles = byType(entities, "SocialProfile");

  const orgLike = [...organizations, ...companies];

  for (const org of orgLike) {
    for (const service of services) {
      relationships.push(makeRelationship({ businessId, source: org, target: service, relationship: "offers", confidence: BASELINE }));
    }
    for (const location of locations) {
      relationships.push(makeRelationship({ businessId, source: org, target: location, relationship: "located_in", confidence: BASELINE }));
    }
    // No more specific verb exists in the existing RelationshipType enum
    // for "this is the organization's own contact info" — `related_to`
    // is the honest generic fit, documented in
    // docs/architecture/knowledge-graph.md.
    for (const email of emails) {
      relationships.push(makeRelationship({ businessId, source: org, target: email, relationship: "related_to", confidence: BASELINE }));
    }
    for (const phone of phones) {
      relationships.push(makeRelationship({ businessId, source: org, target: phone, relationship: "related_to", confidence: BASELINE }));
    }
    for (const profile of socialProfiles) {
      relationships.push(makeRelationship({ businessId, source: org, target: profile, relationship: "related_to", confidence: BASELINE }));
    }
    for (const product of products) {
      if (brands.length === 0) {
        relationships.push(makeRelationship({ businessId, source: org, target: product, relationship: "owns", confidence: BASELINE }));
      }
    }
  }

  for (const brand of brands) {
    for (const product of products) {
      relationships.push(makeRelationship({ businessId, source: brand, target: product, relationship: "owns", confidence: BASELINE }));
    }
  }

  for (const doc of documents) {
    for (const product of products) {
      relationships.push(makeRelationship({ businessId, source: doc, target: product, relationship: "mentions", confidence: BASELINE }));
    }
  }

  // Breadcrumb-derived Keywords stand in for "Category" (not a distinct
  // entity type in the existing enum) — Product BELONGS_TO Keyword.
  for (const product of products) {
    for (const keyword of keywords) {
      relationships.push(makeRelationship({ businessId, source: product, target: keyword, relationship: "belongs_to", confidence: BASELINE }));
    }
  }

  return relationships;
}

// --- Persistence helpers ----------------------------------------------------

/** Inserts a relationship, or — if an identical (source, target, relationship type) edge already exists — boosts its confidence instead of creating a duplicate. This is the "higher when multiple pages agree" mechanism. */
async function upsertRelationship(rel: KnowledgeRelationship): Promise<void> {
  const { data: existing } = await supabase
    .from(RELATIONSHIPS_TABLE)
    .select("*")
    .eq("business_id", rel.businessId)
    .eq("source_entity_id", rel.sourceEntityId)
    .eq("target_entity_id", rel.targetEntityId)
    .eq("relationship", rel.relationship)
    .maybeSingle();

  if (existing) {
    const row = existing as unknown as RelationshipRow;
    await supabase
      .from(RELATIONSHIPS_TABLE)
      .update({
        confidence: Math.min(1, row.confidence + 0.05),
        metadata: mergeMetadata(row.metadata ?? {}, rel.metadata),
      })
      .eq("id", row.id);
    return;
  }

  await supabase.from(RELATIONSHIPS_TABLE).insert({
    business_id: rel.businessId,
    source_entity_id: rel.sourceEntityId,
    target_entity_id: rel.targetEntityId,
    relationship: rel.relationship,
    confidence: rel.confidence,
    metadata: rel.metadata,
  });
}

/**
 * Finds an existing persisted entity that the given candidate should be
 * merged into, per mergeEntities()'s dedup rules: same business + type,
 * and a match on normalized name, or (for Email/Phone) an exact value
 * match, or (for anything carrying a `metadata.domain`, e.g. an
 * Organization) a matching domain.
 */
async function findMergeCandidate(businessId: string, candidate: KnowledgeEntity): Promise<EntityRow | null> {
  const { data } = await supabase
    .from(ENTITIES_TABLE)
    .select("*")
    .eq("business_id", businessId)
    .eq("type", candidate.type);

  const rows = (data ?? []) as unknown as EntityRow[];
  const candidateNormalized = normalizeEntityName(candidate.name);
  const candidateDomain = candidate.metadata?.domain;

  return (
    rows.find((row) => {
      if (row.normalized_name === candidateNormalized) return true;
      if ((candidate.type === "Email" || candidate.type === "Phone") && row.name === candidate.name) return true;
      if (candidateDomain && row.metadata?.domain === candidateDomain) return true;
      return false;
    }) ?? null
  );
}

export const knowledgeGraphEngine = {
  /**
   * Identifies business entities present on a single page, given its
   * ExtractedMetadata. Every source is extracted independently and
   * wrapped so one malformed source (e.g. invalid JSON-LD) never prevents
   * the others from running — "never throw because one page is
   * malformed."
   */
  async extractEntities(businessId: string, page: Page, metadata: ExtractedMetadata): Promise<KnowledgeEntity[]> {
    const entities: KnowledgeEntity[] = [];

    const sources: Array<() => KnowledgeEntity[]> = [
      () => extractFromJsonLd(businessId, page, metadata),
      () => extractFromOpenGraph(businessId, page, metadata),
      () => extractFromTwitterCard(businessId, page, metadata),
      () => extractContactEntitiesFromText(businessId, page, metadata.title, CONFIDENCE.title, "title"),
      () =>
        metadata.headings.flatMap((heading) =>
          extractContactEntitiesFromText(businessId, page, heading.text, CONFIDENCE.heading, "heading"),
        ),
      () => extractContactEntitiesFromText(businessId, page, metadata.metaDescription, CONFIDENCE.metaDescription, "meta-description"),
    ];

    for (const source of sources) {
      try {
        entities.push(...source());
      } catch {
        // Skip this source's entities; keep building from the rest.
        continue;
      }
    }

    try {
      const hasOrganization = entities.some((e) => e.type === "Organization" || e.type === "Company");
      entities.push(...extractDomainFallbackOrganization(businessId, page, hasOrganization));
    } catch {
      // never let the fallback itself break extraction
    }

    return entities;
  },

  /**
   * Identifies relationships between a set of entities found on a single
   * page, via deterministic structural co-occurrence rules (see
   * `inferRelationshipsForPage`). Never throws.
   */
  async extractRelationships(
    businessId: string,
    entities: KnowledgeEntity[],
    _page: Page,
    _metadata: ExtractedMetadata,
  ): Promise<KnowledgeRelationship[]> {
    try {
      return inferRelationshipsForPage(businessId, entities);
    } catch {
      return [];
    }
  },

  /**
   * Merges a set of newly extracted entities into a business's existing
   * persisted entity set, deduplicating by normalized name, type, and
   * (for Email/Phone/anything carrying a domain) exact value match.
   * Matches are updated (not duplicated) — the higher-confidence
   * name/description is kept and page references + metadata are unioned.
   * Non-matches are inserted as new. Returns the full set of resulting
   * entities (both merged-into and newly-inserted).
   */
  async mergeEntities(businessId: string, entities: KnowledgeEntity[]): Promise<KnowledgeEntity[]> {
    const results: KnowledgeEntity[] = [];

    for (const candidate of entities) {
      try {
        const match = await findMergeCandidate(businessId, candidate);

        if (!match) {
          const { data } = await supabase
            .from(ENTITIES_TABLE)
            .insert({
              business_id: candidate.businessId,
              type: candidate.type,
              name: candidate.name,
              normalized_name: normalizeEntityName(candidate.name),
              description: candidate.description,
              source_page_id: candidate.sourcePageId,
              confidence: candidate.confidence,
              metadata: candidate.sourcePageId
                ? { ...candidate.metadata, sourcePageIds: [candidate.sourcePageId] }
                : candidate.metadata,
            })
            .select()
            .single();

          if (data) results.push(mapRowToEntity(data as unknown as EntityRow));
          continue;
        }

        const keepHigherConfidence = candidate.confidence > match.confidence;
        const mergedMetadata = mergeMetadata(match.metadata ?? {}, {
          ...candidate.metadata,
          sourcePageIds: candidate.sourcePageId ? [candidate.sourcePageId] : [],
        });

        const { data } = await supabase
          .from(ENTITIES_TABLE)
          .update({
            name: keepHigherConfidence ? candidate.name : match.name,
            description: keepHigherConfidence ? candidate.description ?? match.description : match.description,
            confidence: Math.max(candidate.confidence, match.confidence),
            metadata: mergedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .select()
          .single();

        if (data) results.push(mapRowToEntity(data as unknown as EntityRow));
      } catch {
        // Skip this one candidate; keep merging the rest — one bad
        // entity must never abort the whole merge.
        continue;
      }
    }

    return results;
  },

  /**
   * Fetches a single known entity by id, scoped to the business it
   * belongs to. Implemented against real persistent storage (see
   * `supabase/migrations/20260714010000_create_knowledge_graph_tables.sql`).
   */
  async findEntity(businessId: string, entityId: string): Promise<KnowledgeEntity | null> {
    const { data, error } = await supabase
      .from(ENTITIES_TABLE)
      .select("*")
      .eq("id", entityId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throw new Error(`KnowledgeGraphEngine.findEntity: ${error.message}`);
    return data ? mapRowToEntity(data as unknown as EntityRow) : null;
  },

  /**
   * Lists known entities for a business, optionally filtered by type, a
   * free-text name search, and/or a minimum confidence threshold.
   */
  async findEntities(businessId: string, filter?: FindEntitiesFilter): Promise<KnowledgeEntity[]> {
    let query = supabase.from(ENTITIES_TABLE).select("*").eq("business_id", businessId);

    if (filter?.type) query = query.eq("type", filter.type);
    if (filter?.query) query = query.ilike("name", `%${filter.query}%`);
    if (typeof filter?.minConfidence === "number") query = query.gte("confidence", filter.minConfidence);

    const { data, error } = await query;
    if (error) throw new Error(`KnowledgeGraphEngine.findEntities: ${error.message}`);
    return (data ?? []).map((row) => mapRowToEntity(row as unknown as EntityRow));
  },

  /**
   * Lists known relationships for a business, optionally filtered by a
   * specific entity (as either source or target via `entityId`, or
   * direction-specifically via `sourceEntityId`/`targetEntityId`), or by
   * relationship type.
   */
  async findRelationships(businessId: string, filter?: FindRelationshipsFilter): Promise<KnowledgeRelationship[]> {
    let query = supabase.from(RELATIONSHIPS_TABLE).select("*").eq("business_id", businessId);

    if (filter?.sourceEntityId) query = query.eq("source_entity_id", filter.sourceEntityId);
    if (filter?.targetEntityId) query = query.eq("target_entity_id", filter.targetEntityId);
    if (filter?.entityId) {
      query = query.or(`source_entity_id.eq.${filter.entityId},target_entity_id.eq.${filter.entityId}`);
    }
    if (filter?.relationship) query = query.eq("relationship", filter.relationship);

    const { data, error } = await query;
    if (error) throw new Error(`KnowledgeGraphEngine.findRelationships: ${error.message}`);
    return (data ?? []).map((row) => mapRowToRelationship(row as unknown as RelationshipRow));
  },

  /**
   * Assembles the full current Knowledge Graph for a business: fetches
   * every page from Page Repository, extracts entities and
   * relationships from each (never letting one malformed page abort the
   * rest), merges/persists entities, persists (or strengthens)
   * relationships, and returns the resulting graph read back from
   * storage.
   */
  async buildKnowledgeGraph(businessId: string): Promise<KnowledgeGraph> {
    const pages = await pageService.listPages(businessId);

    for (const page of pages) {
      try {
        const metadata = pageToMinimalExtractedMetadata(page);
        const extracted = await this.extractEntities(businessId, page, metadata);
        const merged = await this.mergeEntities(businessId, extracted);
        const relationships = await this.extractRelationships(businessId, merged, page, metadata);

        for (const relationship of relationships) {
          try {
            await upsertRelationship(relationship);
          } catch {
            continue; // one bad relationship must not abort the rest
          }
        }
      } catch {
        // One malformed/unreadable page must never abort building the
        // graph from the rest of the business's pages.
        continue;
      }
    }

    const [entities, relationships] = await Promise.all([this.findEntities(businessId), this.findRelationships(businessId)]);

    return { businessId, entities, relationships, lastUpdated: new Date().toISOString() };
  },
};
