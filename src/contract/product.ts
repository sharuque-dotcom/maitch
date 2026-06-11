/**
 * LAYER 1 — Data, translated.
 *
 * The common Product contract. Every catalogue (SAP Commerce, Shopify, a
 * custom backend, ...) is translated into this shape exactly once, via a
 * ProductMapper<TSource>. Everything downstream — chunking, embedding,
 * search, the agent tools — only ever sees this contract.
 */

export interface Money {
  /** Amount in major units, e.g. 19.99 */
  amount: number;
  /** ISO 4217 currency code, e.g. "EUR" */
  currency: string;
}

export interface ProductVariant {
  id: string;
  title?: string;
  /** Variant-level attributes, e.g. { size: "M", color: "navy" } */
  attributes?: Record<string, string>;
  price?: Money;
  inStock?: boolean;
}

export interface ProductPolicies {
  returns?: string;
  warranty?: string;
  shipping?: string;
}

export interface ProductCompatibility {
  /** Product ids or tags this product is declared to work with. */
  worksWith?: string[];
  /** Free-text standards/specs used for rule matching, e.g. "USB-C", "Qi2". */
  standards?: string[];
}

export interface Product {
  /** Stable id from the source system (e.g. SAP code, Shopify handle). */
  id: string;
  title: string;
  description?: string;
  brand?: string;
  /** Category path from root to leaf, e.g. ["Audio", "Headphones", "Over-ear"]. */
  category?: string[];
  price?: Money;
  /** Normalised spec attributes, e.g. { "battery life": "30h", weight: "250g" }. */
  attributes?: Record<string, string>;
  tags?: string[];
  variants?: ProductVariant[];
  inStock?: boolean;
  url?: string;
  imageUrl?: string;
  policies?: ProductPolicies;
  compatibility?: ProductCompatibility;
}

/**
 * Implement once per platform: translate the source system's product model
 * into the common Product contract.
 */
export interface ProductMapper<TSource> {
  /** Human-readable name of the source, e.g. "sap-commerce". */
  source: string;
  map(item: TSource): Product;
}

/** A product with a relevance score, as returned by Layer 2 retrieval. */
export interface ScoredProduct {
  product: Product;
  /** Cosine-similarity-derived score in [0, 1]. */
  score: number;
}

export function validateProduct(p: Product): void {
  if (!p.id || typeof p.id !== "string") {
    throw new Error("Product.id is required and must be a string");
  }
  if (!p.title || typeof p.title !== "string") {
    throw new Error(`Product ${p.id}: title is required`);
  }
}
