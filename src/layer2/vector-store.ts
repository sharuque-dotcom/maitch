/**
 * LAYER 2 — Meaning, stored (part 3: the vector store).
 *
 * This is mAItch's own store — the catalogue is pushed in here and queried
 * here. No Solr involved. The interface is intentionally tiny so a pgvector,
 * Qdrant, or OpenSearch adapter can be dropped in without touching the rest
 * of the module; the in-memory implementation (with JSON file persistence)
 * is the default.
 */
import { readFile, writeFile } from "node:fs/promises";
import type { ChunkKind } from "./chunks.js";

export interface StoredChunk {
  id: string;
  productId: string;
  kind: ChunkKind;
  text: string;
  vector: number[];
}

export interface ChunkHit {
  chunk: StoredChunk;
  /** Cosine similarity in [-1, 1]. */
  similarity: number;
}

export interface VectorStore {
  upsert(chunks: StoredChunk[]): Promise<void>;
  query(vector: number[], topK: number): Promise<ChunkHit[]>;
  deleteByProduct(productId: string): Promise<void>;
  size(): Promise<number>;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export class InMemoryVectorStore implements VectorStore {
  private chunks = new Map<string, StoredChunk>();

  async upsert(chunks: StoredChunk[]): Promise<void> {
    for (const chunk of chunks) this.chunks.set(chunk.id, chunk);
  }

  async query(vector: number[], topK: number): Promise<ChunkHit[]> {
    const hits: ChunkHit[] = [];
    for (const chunk of this.chunks.values()) {
      hits.push({ chunk, similarity: dot(vector, chunk.vector) });
    }
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, topK);
  }

  async deleteByProduct(productId: string): Promise<void> {
    for (const [id, chunk] of this.chunks) {
      if (chunk.productId === productId) this.chunks.delete(id);
    }
  }

  async size(): Promise<number> {
    return this.chunks.size;
  }

  /** Persist the index to a JSON file so re-ingest isn't needed on restart. */
  async save(path: string): Promise<void> {
    await writeFile(path, JSON.stringify([...this.chunks.values()]));
  }

  async load(path: string): Promise<void> {
    const chunks = JSON.parse(await readFile(path, "utf8")) as StoredChunk[];
    this.chunks = new Map(chunks.map((c) => [c.id, c]));
  }
}
