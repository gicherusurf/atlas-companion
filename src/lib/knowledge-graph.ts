import type { Page } from "@/types/page";
import type { ExtractedMetadata } from "@/types/metadata";
import type {
  KnowledgeEntity,
  KnowledgeRelationship,
  KnowledgeGraph,
  FindEntitiesFilter,
  FindRelationshipsFilter,
} from "@/types/knowledge";

// Atlas Knowledge Graph Engine.
//
// Transforms structured page metadata into business knowledge: it
// identifies business entities (companies, products, people, locations,
// etc.) and the relationships between them. This is Atlas's canonical
// business understanding layer — every department eventually reads from
// it rather than re-deriving business facts from raw pages themselves.
//
// This engine does NOT crawl websites, does NOT perform SEO analysis, and
// does NOT generate AI content. It understands businesses; it does not
// evaluate or optimize them — that is left entirely to future consumers
// (SEO Audit Engine, Content Engine, Marketing Engine, Sales Intelligence,
// Business Intelligence, Atlas AI Agents, Mission Control).
//
// Inputs: `ExtractedMetadata` (src/types/metadata.ts), `Page`
// (src/types/page.ts), and Business Genome data (src/types/business.ts).
// Output: a `KnowledgeGraph`. This file must have no dependency on SEO,
// Marketing, Finance, Sales, Publishing, or Analytics modules — those
// consume the Knowledge Graph, never the reverse.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods, no mock data, `TODO(knowledge-engine)` markers (with
// more specific sub-tags — `TODO(entity-recognition)`,
// `TODO(entity-deduplication)`, `TODO(relationship-inference)`,
// `TODO(llm-extraction)`) instead of real NLP/LLM logic. No persistence
// exists yet, so read methods return empty results rather than throwing.

function notImplemented(action: string): never {
  throw new Error(
    `KnowledgeGraphEngine.${action} is not implemented yet — TODO(knowledge-engine): wire this up.`,
  );
}

export const knowledgeGraphEngine = {
  /**
   * Identifies business entities present on a single page, given its
   * ExtractedMetadata.
   */
  async extractEntities(_businessId: string, _page: Page, _metadata: ExtractedMetadata): Promise<KnowledgeEntity[]> {
    // TODO(knowledge-engine):
    //   - TODO(entity-recognition): identify candidate entities from the
    //     page's text (title, headings, body content), structured data
    //     (JSON-LD @type/name/description map fairly directly onto
    //     entities), and Open Graph tags (og:site_name -> Organization,
    //     etc.) — likely a rules/heuristics pass first, before any
    //     LLM-based extraction is introduced
    //   - TODO(llm-extraction): for entity types that are hard to detect
    //     with rules alone (Person, Technology, Keyword), consider an LLM
    //     pass over the page's extracted text, given clear entity-type
    //     definitions and a schema to constrain its output
    //   - each candidate becomes a KnowledgeEntity with sourcePageId set
    //     to `page.id`, confidence reflecting how the entity was found
    //     (rule match vs. LLM inference), and metadata carrying whatever
    //     supporting detail (e.g. the JSON-LD block it came from)
    //   - this method does NOT deduplicate against existing entities for
    //     the business — see mergeEntities() for that
    return notImplemented("extractEntities");
  },

  /**
   * Identifies relationships between a set of entities found on a single
   * page (or, eventually, across the whole business).
   */
  async extractRelationships(
    _businessId: string,
    _entities: KnowledgeEntity[],
    _page: Page,
    _metadata: ExtractedMetadata,
  ): Promise<KnowledgeRelationship[]> {
    // TODO(knowledge-engine):
    //   - TODO(relationship-inference): infer relationships between the
    //     given entities based on co-occurrence and structural context —
    //     e.g. a Company entity and a Product entity appearing together
    //     under an "Our Products" heading suggests `offers`; an Address
    //     entity near a Company entity suggests `located_in`
    //   - TODO(llm-extraction): relationships that require understanding
    //     phrasing (e.g. distinguishing `partner_of` from `works_with`,
    //     or `manufactures` from `offers`) likely need an LLM pass rather
    //     than purely structural heuristics
    //   - each inferred relationship becomes a KnowledgeRelationship with
    //     confidence reflecting how strong the signal was, and metadata
    //     carrying supporting context (e.g. the sentence/section it was
    //     inferred from)
    return notImplemented("extractRelationships");
  },

  /**
   * Merges a set of newly extracted entities into a business's existing
   * entity set, deduplicating entities that refer to the same real-world
   * thing (e.g. the same Company entity found on multiple pages).
   */
  async mergeEntities(_businessId: string, _entities: KnowledgeEntity[]): Promise<KnowledgeEntity[]> {
    // TODO(knowledge-engine):
    //   - TODO(entity-deduplication): compare each new entity against the
    //     business's existing entities of the same `type` (name
    //     similarity, shared metadata such as a matching email/URL/address,
    //     or eventually embedding similarity for fuzzier matches)
    //   - when a match is found, merge rather than duplicate: keep the
    //     higher-confidence `name`/`description`, union `metadata`, and
    //     track all contributing `sourcePageId`s (this may require
    //     widening KnowledgeEntity.sourcePageId to a list in a future
    //     revision, once real merging logic exists)
    //   - when no match is found, the entity is added as new
    return notImplemented("mergeEntities");
  },

  /**
   * Fetches a single known entity by id.
   */
  async findEntity(_businessId: string, _entityId: string): Promise<KnowledgeEntity | null> {
    // TODO(knowledge-engine): once entities are persisted, look this up
    // from the Knowledge Graph's storage layer, scoped to businessId.
    return null;
  },

  /**
   * Lists known entities for a business, optionally filtered by type or a
   * free-text name/description query.
   */
  async findEntities(_businessId: string, _filter?: FindEntitiesFilter): Promise<KnowledgeEntity[]> {
    // TODO(knowledge-engine): once entities are persisted, query them from
    // the Knowledge Graph's storage layer, scoped to businessId and
    // filtered by type/query.
    return [];
  },

  /**
   * Lists known relationships for a business, optionally filtered by a
   * specific entity (as either source or target) or relationship type.
   */
  async findRelationships(
    _businessId: string,
    _filter?: FindRelationshipsFilter,
  ): Promise<KnowledgeRelationship[]> {
    // TODO(knowledge-engine): once relationships are persisted, query them
    // from the Knowledge Graph's storage layer, scoped to businessId and
    // filtered by entityId/relationship.
    return [];
  },

  /**
   * Assembles the full current Knowledge Graph for a business: every known
   * entity and relationship, as of now.
   */
  async buildKnowledgeGraph(businessId: string): Promise<KnowledgeGraph> {
    // TODO(knowledge-engine): once entities/relationships are persisted,
    // this should fetch both sets from storage rather than calling
    // findEntities/findRelationships with no filters (which is what it
    // does today, since there's no storage layer yet to query more
    // directly).
    const [entities, relationships] = await Promise.all([
      this.findEntities(businessId),
      this.findRelationships(businessId),
    ]);

    return {
      businessId,
      entities,
      relationships,
      lastUpdated: new Date().toISOString(),
    };
  },
};
