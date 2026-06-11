/**
 * LAYER 2 — Meaning, stored (part 2: embeddings).
 *
 * Pluggable embedding providers. Production deployments plug in a hosted
 * embeddings API (a VoyageEmbeddingProvider is included); development and
 * tests run on a deterministic local hashing embedder so the module works
 * with zero external services.
 */

export interface EmbeddingProvider {
  /** Identifier, used to detect index/provider mismatches. */
  id: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/* ------------------------------------------------------------------ */
/* Local deterministic embedder (dev/test default)                     */
/* ------------------------------------------------------------------ */

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);
}

/**
 * Hashing bag-of-tokens embedder (unigrams + bigrams folded into a fixed
 * vector, L2-normalised). Deterministic and dependency-free; good enough
 * for local development, demos, and tests — swap in a real provider for
 * production-quality semantic recall.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local-hash-v1";
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    const add = (term: string, weight: number) => {
      const h = fnv1a(term);
      const index = h % this.dimensions;
      const sign = (h & 0x80000000) === 0 ? 1 : -1;
      vec[index] = (vec[index] ?? 0) + sign * weight;
    };
    for (const token of tokens) add(token, 1);
    for (let i = 0; i < tokens.length - 1; i++) add(`${tokens[i]}_${tokens[i + 1]}`, 0.5);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

/* ------------------------------------------------------------------ */
/* Voyage AI embedder (production)                                     */
/* ------------------------------------------------------------------ */

export interface VoyageOptions {
  apiKey?: string;
  /** Voyage embedding model, e.g. "voyage-3.5". */
  model?: string;
  dimensions?: number;
  baseUrl?: string;
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: VoyageOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.VOYAGE_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error("VoyageEmbeddingProvider requires an API key (VOYAGE_API_KEY)");
    }
    this.model = opts.model ?? "voyage-3.5";
    this.dimensions = opts.dimensions ?? 1024;
    this.baseUrl = opts.baseUrl ?? "https://api.voyageai.com/v1";
    this.id = `voyage:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
    return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
