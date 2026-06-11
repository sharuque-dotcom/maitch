/**
 * LAYER 2 — Meaning, stored (part 1: typed chunks).
 *
 * A product is decomposed into a small set of *typed* chunks. Each chunk is
 * embedded independently, so a query about battery life can land on the
 * specs chunk while a vibe query ("something cozy for winter evenings")
 * lands on the description chunk. Meaning-based search, not keyword search.
 */
import type { Product } from "../contract/product.js";

export type ChunkKind = "identity" | "description" | "specs" | "variants" | "policies";

export interface TypedChunk {
  /** "<productId>#<kind>" */
  id: string;
  productId: string;
  kind: ChunkKind;
  text: string;
}

export function chunkProduct(product: Product): TypedChunk[] {
  const chunks: TypedChunk[] = [];
  const push = (kind: ChunkKind, text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) {
      chunks.push({ id: `${product.id}#${kind}`, productId: product.id, kind, text: trimmed });
    }
  };

  const identityParts = [
    product.title,
    product.brand && `by ${product.brand}`,
    product.category?.length && `in ${product.category.join(" > ")}`,
    product.tags?.length && `tags: ${product.tags.join(", ")}`,
    product.price && `price: ${product.price.amount} ${product.price.currency}`,
  ].filter(Boolean);
  push("identity", identityParts.join(". "));

  if (product.description) push("description", `${product.title}. ${product.description}`);

  const specEntries = Object.entries(product.attributes ?? {});
  const standards = product.compatibility?.standards ?? [];
  if (specEntries.length || standards.length) {
    const specs = specEntries.map(([k, v]) => `${k}: ${v}`);
    if (standards.length) specs.push(`supports: ${standards.join(", ")}`);
    push("specs", `${product.title} specifications. ${specs.join(". ")}`);
  }

  if (product.variants?.length) {
    const variantText = product.variants
      .map((v) => {
        const attrs = Object.entries(v.attributes ?? {})
          .map(([k, val]) => `${k} ${val}`)
          .join(", ");
        return [v.title, attrs].filter(Boolean).join(" — ");
      })
      .filter(Boolean)
      .join("; ");
    push("variants", `${product.title} available as: ${variantText}`);
  }

  const policies = Object.entries(product.policies ?? {}).map(([k, v]) => `${k}: ${v}`);
  if (policies.length) push("policies", `${product.title} policies. ${policies.join(". ")}`);

  return chunks;
}
