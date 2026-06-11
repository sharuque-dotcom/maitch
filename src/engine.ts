/**
 * The mAItch engine: one deployment that wires the three layers together.
 *
 *   ingest()  — Layer 1: source items → ProductMapper<T> → Product contract,
 *               then Layer 2: typed chunks → embeddings → vector store.
 *   search()  — Layer 2: query → embedding → chunk hits → scored products.
 *
 * Layer 3 (tools), the search agent, the REST server, and the MCP server all
 * sit on top of this class.
 */
import type { Product, ProductMapper, ScoredProduct } from "./contract/product.js";
import { validateProduct } from "./contract/product.js";
import { chunkProduct } from "./layer2/chunks.js";
import type { EmbeddingProvider } from "./layer2/embeddings.js";
import { LocalEmbeddingProvider } from "./layer2/embeddings.js";
import type { StoredChunk, VectorStore } from "./layer2/vector-store.js";
import { InMemoryVectorStore } from "./layer2/vector-store.js";

export interface MaitchEngineOptions {
  embeddings?: EmbeddingProvider;
  vectorStore?: VectorStore;
}

export class MaitchEngine {
  readonly embeddings: EmbeddingProvider;
  readonly vectorStore: VectorStore;
  private readonly products = new Map<string, Product>();

  constructor(opts: MaitchEngineOptions = {}) {
    this.embeddings = opts.embeddings ?? new LocalEmbeddingProvider();
    this.vectorStore = opts.vectorStore ?? new InMemoryVectorStore();
  }

  /** Push a catalogue (or a delta) through a mapper into the store. */
  async ingest<TSource>(items: TSource[], mapper: ProductMapper<TSource>): Promise<number> {
    const products = items.map((item) => mapper.map(item));
    return this.ingestProducts(products);
  }

  /** Ingest items already in the common Product contract. */
  async ingestProducts(products: Product[]): Promise<number> {
    const allChunks = products.flatMap((product) => {
      validateProduct(product);
      this.products.set(product.id, product);
      return chunkProduct(product);
    });
    // Embed in batches to keep request sizes reasonable for hosted providers.
    const batchSize = 64;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const vectors = await this.embeddings.embed(batch.map((c) => c.text));
      const stored: StoredChunk[] = batch.map((chunk, j) => ({
        ...chunk,
        vector: vectors[j]!,
      }));
      await this.vectorStore.upsert(stored);
    }
    return products.length;
  }

  async removeProduct(productId: string): Promise<void> {
    this.products.delete(productId);
    await this.vectorStore.deleteByProduct(productId);
  }

  getProduct(productId: string): Product | undefined {
    return this.products.get(productId);
  }

  listProducts(): Product[] {
    return [...this.products.values()];
  }

  /**
   * Meaning-based retrieval: embed the query, take the top chunk hits, and
   * aggregate per product (best chunk similarity plus a small bonus when
   * several chunks of the same product match — a product that matches on
   * both description and specs is a stronger candidate than a single hit).
   */
  async search(query: string, topK = 3): Promise<ScoredProduct[]> {
    const [queryVector] = await this.embeddings.embed([query]);
    const hits = await this.vectorStore.query(queryVector!, Math.max(topK * 8, 24));
    const byProduct = new Map<string, { best: number; extra: number }>();
    for (const hit of hits) {
      const entry = byProduct.get(hit.chunk.productId);
      const similarity = Math.max(0, hit.similarity);
      if (!entry) {
        byProduct.set(hit.chunk.productId, { best: similarity, extra: 0 });
      } else {
        entry.extra += similarity * 0.1;
        entry.best = Math.max(entry.best, similarity);
      }
    }
    const scored: ScoredProduct[] = [];
    for (const [productId, { best, extra }] of byProduct) {
      const product = this.products.get(productId);
      if (!product) continue;
      scored.push({ product, score: Math.min(1, best + extra) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
