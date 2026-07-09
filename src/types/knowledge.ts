// TODO(knowledge-engine): once a real persistence layer exists for the
// Knowledge Graph, align these shapes with the DB schema (e.g. via
// `supabase gen types typescript`) instead of hand-maintaining them.

/**
 * The kinds of business entities the Knowledge Graph Engine can identify.
 * Extend this union as new entity types are needed.
 */
export type KnowledgeEntityType =
  | "Company"
  | "Product"
  | "Service"
  | "Brand"
  | "Person"
  | "Location"
  | "Country"
  | "City"
  | "Industry"
  | "Technology"
  | "Keyword"
  | "Organization"
  | "Document"
  | "Contact"
  | "Email"
  | "Phone"
  | "Address"
  | "SocialProfile";

/**
 * A single business entity identified from a business's pages. Entities
 * are the nodes of the Knowledge Graph.
 */
export interface KnowledgeEntity {
  id: string;
  businessId: string;
  type: KnowledgeEntityType;
  name: string;
  description: string | null;
  /** The Page (see `src/types/page.ts`) this entity was identified from, if any. */
  sourcePageId: string | null;
  /** 0–1. How confident the (eventual) extraction process is in this entity. */
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * The kinds of relationships the Knowledge Graph Engine can identify
 * between two entities. Extend this union as new relationship types are
 * needed.
 */
export type RelationshipType =
  | "owns"
  | "produces"
  | "offers"
  | "located_in"
  | "belongs_to"
  | "manufactures"
  | "exports"
  | "imports"
  | "mentions"
  | "related_to"
  | "works_with"
  | "partner_of";

/**
 * A directed relationship between two KnowledgeEntity records. Relationships
 * are the edges of the Knowledge Graph.
 */
export interface KnowledgeRelationship {
  id: string;
  businessId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationship: RelationshipType;
  /** 0–1. How confident the (eventual) inference process is in this relationship. */
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * The full Knowledge Graph for a single business: every entity identified
 * and every relationship between them. This is the canonical business
 * understanding layer every Atlas department eventually consumes.
 */
export interface KnowledgeGraph {
  businessId: string;
  entities: KnowledgeEntity[];
  relationships: KnowledgeRelationship[];
  lastUpdated: string;
}

/**
 * Optional filters for findEntities().
 */
export interface FindEntitiesFilter {
  type?: KnowledgeEntityType;
  query?: string;
}

/**
 * Optional filters for findRelationships().
 */
export interface FindRelationshipsFilter {
  entityId?: string;
  relationship?: RelationshipType;
}
