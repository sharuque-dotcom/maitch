import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkProduct } from "../src/layer2/chunks.js";
import { LocalEmbeddingProvider } from "../src/layer2/embeddings.js";
import { InMemoryVectorStore } from "../src/layer2/vector-store.js";
import type { Product } from "../src/contract/product.js";

const product: Product = {
  id: "P1",
  title: "Trail Runner X",
  description: "Lightweight trail running shoe with aggressive grip.",
  brand: "FleetFoot",
  category: ["Footwear", "Running"],
  attributes: { drop: "6mm", weight: "240g" },
  variants: [{ id: "P1-42", attributes: { size: "42" } }],
  policies: { returns: "30 days" },
};

test("chunkProduct produces one chunk per populated facet, typed and prefixed", () => {
  const chunks = chunkProduct(product);
  const kinds = chunks.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["description", "identity", "policies", "specs", "variants"]);
  for (const chunk of chunks) {
    assert.equal(chunk.productId, "P1");
    assert.equal(chunk.id, `P1#${chunk.kind}`);
    assert.ok(chunk.text.length > 0);
  }
});

test("chunkProduct skips empty facets", () => {
  const chunks = chunkProduct({ id: "P2", title: "Bare Product" });
  assert.deepEqual(chunks.map((c) => c.kind), ["identity"]);
});

test("local embeddings are deterministic, normalised, and rank related text higher", async () => {
  const provider = new LocalEmbeddingProvider();
  const [a1] = await provider.embed(["running shoes for trails"]);
  const [a2] = await provider.embed(["running shoes for trails"]);
  assert.deepEqual(a1, a2);
  const norm = Math.sqrt(a1!.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);

  const [query, related, unrelated] = await provider.embed([
    "trail running shoe",
    "lightweight trail running shoe with grip",
    "stainless steel kitchen knife set",
  ]);
  const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
  assert.ok(dot(query!, related!) > dot(query!, unrelated!));
});

test("in-memory vector store upserts, queries top-k, and deletes by product", async () => {
  const provider = new LocalEmbeddingProvider();
  const store = new InMemoryVectorStore();
  const chunks = chunkProduct(product);
  const vectors = await provider.embed(chunks.map((c) => c.text));
  await store.upsert(chunks.map((c, i) => ({ ...c, vector: vectors[i]! })));
  assert.equal(await store.size(), chunks.length);

  const [queryVec] = await provider.embed(["trail running shoe"]);
  const hits = await store.query(queryVec!, 2);
  assert.equal(hits.length, 2);
  assert.ok(hits[0]!.similarity >= hits[1]!.similarity);

  await store.deleteByProduct("P1");
  assert.equal(await store.size(), 0);
});
