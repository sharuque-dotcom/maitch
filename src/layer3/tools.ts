/**
 * LAYER 3 — Tools, exposed.
 *
 * The four capabilities the architecture exposes to any agent surface:
 * search · compatibility · policy · basket. The REST server and the MCP
 * server are thin transports over this class — same tools, one deployment,
 * three surfaces (search box, product pages, checkout).
 */
import type { Product, ScoredProduct } from "../contract/product.js";
import type { MaitchEngine } from "../engine.js";

/* ------------------------------------------------------------------ */
/* compatibility                                                       */
/* ------------------------------------------------------------------ */

export interface CompatibilityResult {
  compatible: boolean | "unknown";
  reasons: string[];
}

function declaredWorksWith(a: Product, b: Product): boolean {
  const refs = (a.compatibility?.worksWith ?? []).map((r) => r.toLowerCase());
  if (!refs.length) return false;
  const targets = [b.id, ...(b.tags ?? []), b.brand ?? ""].map((t) => t.toLowerCase());
  return refs.some((ref) => targets.includes(ref));
}

function sharedStandards(a: Product, b: Product): string[] {
  const sa = new Set((a.compatibility?.standards ?? []).map((s) => s.toLowerCase()));
  return (b.compatibility?.standards ?? []).filter((s) => sa.has(s.toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* policy                                                              */
/* ------------------------------------------------------------------ */

export type PolicyTopic = "returns" | "warranty" | "shipping";

export interface PolicyProvider {
  getPolicy(topic: PolicyTopic, product?: Product): string | undefined;
}

/** Catalogue-wide defaults; per-product Product.policies override them. */
export class StaticPolicyProvider implements PolicyProvider {
  constructor(private readonly defaults: Partial<Record<PolicyTopic, string>> = {}) {}

  getPolicy(topic: PolicyTopic, product?: Product): string | undefined {
    return product?.policies?.[topic] ?? this.defaults[topic];
  }
}

/* ------------------------------------------------------------------ */
/* basket                                                              */
/* ------------------------------------------------------------------ */

export interface BasketLine {
  productId: string;
  variantId?: string;
  quantity: number;
}

/**
 * Implement this against the commerce engine's cart API to keep checkout in
 * the platform of record; the in-memory adapter is for demos and tests.
 */
export interface BasketAdapter {
  add(sessionId: string, line: BasketLine): Promise<BasketLine[]>;
  remove(sessionId: string, productId: string, variantId?: string): Promise<BasketLine[]>;
  get(sessionId: string): Promise<BasketLine[]>;
}

export class InMemoryBasketAdapter implements BasketAdapter {
  private baskets = new Map<string, BasketLine[]>();

  async add(sessionId: string, line: BasketLine): Promise<BasketLine[]> {
    const basket = this.baskets.get(sessionId) ?? [];
    const existing = basket.find(
      (l) => l.productId === line.productId && l.variantId === line.variantId,
    );
    if (existing) existing.quantity += line.quantity;
    else basket.push({ ...line });
    this.baskets.set(sessionId, basket);
    return basket;
  }

  async remove(sessionId: string, productId: string, variantId?: string): Promise<BasketLine[]> {
    const basket = (this.baskets.get(sessionId) ?? []).filter(
      (l) => !(l.productId === productId && (variantId === undefined || l.variantId === variantId)),
    );
    this.baskets.set(sessionId, basket);
    return basket;
  }

  async get(sessionId: string): Promise<BasketLine[]> {
    return this.baskets.get(sessionId) ?? [];
  }
}

/* ------------------------------------------------------------------ */
/* the toolset                                                         */
/* ------------------------------------------------------------------ */

export interface MaitchToolsOptions {
  policyProvider?: PolicyProvider;
  basketAdapter?: BasketAdapter;
}

export class MaitchTools {
  readonly policyProvider: PolicyProvider;
  readonly basketAdapter: BasketAdapter;

  constructor(
    private readonly engine: MaitchEngine,
    opts: MaitchToolsOptions = {},
  ) {
    this.policyProvider = opts.policyProvider ?? new StaticPolicyProvider();
    this.basketAdapter = opts.basketAdapter ?? new InMemoryBasketAdapter();
  }

  /** Meaning-based search. Always returns at most three matches. */
  async search(query: string, topK = 3): Promise<ScoredProduct[]> {
    return this.engine.search(query, Math.min(topK, 3));
  }

  async compatibility(productId: string, withProductId: string): Promise<CompatibilityResult> {
    const a = this.engine.getProduct(productId);
    const b = this.engine.getProduct(withProductId);
    if (!a || !b) {
      return { compatible: "unknown", reasons: ["one or both products were not found"] };
    }
    const reasons: string[] = [];
    if (declaredWorksWith(a, b) || declaredWorksWith(b, a)) {
      reasons.push("explicitly declared compatible by the catalogue");
    }
    const standards = sharedStandards(a, b);
    if (standards.length) {
      reasons.push(`share standards: ${standards.join(", ")}`);
    }
    if (reasons.length) return { compatible: true, reasons };
    if (a.compatibility || b.compatibility) {
      return {
        compatible: false,
        reasons: ["no declared compatibility link and no shared standards"],
      };
    }
    return { compatible: "unknown", reasons: ["catalogue carries no compatibility data"] };
  }

  async policy(topic: PolicyTopic, productId?: string): Promise<string | undefined> {
    const product = productId ? this.engine.getProduct(productId) : undefined;
    return this.policyProvider.getPolicy(topic, product);
  }

  async basketAdd(sessionId: string, line: BasketLine): Promise<BasketLine[]> {
    if (!this.engine.getProduct(line.productId)) {
      throw new Error(`unknown product: ${line.productId}`);
    }
    return this.basketAdapter.add(sessionId, line);
  }

  async basketRemove(
    sessionId: string,
    productId: string,
    variantId?: string,
  ): Promise<BasketLine[]> {
    return this.basketAdapter.remove(sessionId, productId, variantId);
  }

  async basketGet(sessionId: string): Promise<BasketLine[]> {
    return this.basketAdapter.get(sessionId);
  }
}
