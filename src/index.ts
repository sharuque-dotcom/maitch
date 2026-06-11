// Layer 1 — Data, translated
export * from "./contract/product.js";
export { sapCommerceMapper, type SapCommerceProduct } from "./layer1/mappers/sap-commerce.js";
export { shopifyMapper, type ShopifyProduct } from "./layer1/mappers/shopify.js";

// Layer 2 — Meaning, stored
export { chunkProduct, type TypedChunk, type ChunkKind } from "./layer2/chunks.js";
export {
  LocalEmbeddingProvider,
  VoyageEmbeddingProvider,
  type EmbeddingProvider,
} from "./layer2/embeddings.js";
export {
  InMemoryVectorStore,
  type VectorStore,
  type StoredChunk,
  type ChunkHit,
} from "./layer2/vector-store.js";

// Engine
export { MaitchEngine, type MaitchEngineOptions } from "./engine.js";

// Layer 3 — Tools, exposed
export {
  MaitchTools,
  StaticPolicyProvider,
  InMemoryBasketAdapter,
  type PolicyProvider,
  type PolicyTopic,
  type BasketAdapter,
  type BasketLine,
  type CompatibilityResult,
} from "./layer3/tools.js";
export { createMcpServer } from "./layer3/mcp-server.js";

// The search agent
export {
  SearchAgent,
  MAX_QUESTIONS,
  RESULT_COUNT,
  type SearchTurnInput,
  type SearchTurnResult,
  type ProductMatch,
} from "./agent/search-agent.js";
export {
  AnthropicPlanner,
  HeuristicPlanner,
  type Planner,
  type PlannerContext,
  type PlannerDecision,
} from "./agent/planner.js";
export { InMemorySessionStore, type SessionStore, type SearchSession } from "./agent/sessions.js";

// Transports & facade
export { createHttpServer } from "./server/http.js";
export { MaitchSearch, type MaitchSearchOptions } from "./maitch.js";
