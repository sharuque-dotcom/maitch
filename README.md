# mAItch Search

> Your customers know what they want. Your search engine doesn't.

mAItch Search turns any product catalogue into an AI-native discovery experience that **understands intent, asks one smart question, and delivers exactly three matches**. Built for the era where AI agents shop on behalf of humans. Any platform. Any agent. **Two questions maximum.**

```
YOUR CATALOGUE                    mAItch Search                      ANY AI AGENT
SAP Commerce   ─┐   ┌─────────────────────────────────────┐   ┌─→ Your search agent
Shopify         │   │ LAYER 1 — Data, translated          │   ├─→ Google Shopping
Custom backend  ├──→│   your model → common Product       │──→├─→ ChatGPT
Node.js stack   │   │   contract (ProductMapper<T>, once) │MCP├─→ Claude
Any platform   ─┘   │ LAYER 2 — Meaning, stored           │   └─→ Future agents
                    │   typed chunks → embedded → vector  │
                    │   store                             │
                    │ LAYER 3 — Tools, exposed            │
                    │   search · compatibility · policy   │
                    │   · basket                          │
                    └─────────────────────────────────────┘
                    One deployment. Three surfaces:
                    Search · Product pages · Checkout
```

## How it relates to your existing commerce engine

mAItch is an **alternate to legacy search**, not a layer on top of it. Think of it as a **toggle on the search box**: one position connects to your existing engine (e.g. Solr in SAP Commerce / hybris), the other to the mAItch agent. The pattern from FE to BE stays exactly the same — **one REST call**.

- The **whole product catalogue is pushed into mAItch's own store** (via a `ProductMapper<T>` you implement once). The agent searches there and returns results **bypassing Solr entirely** — no Solr involved on this path.
- Solr stores keywords and does keyword-based search; mAItch stores **vectors** and does **meaning-based search**.
- It is **not a chatbot** — at least not at the search-box level. A turn returns either a single structured clarifying question (with 2–4 tappable options) or exactly three product matches. UX decisions stay with the storefront.

## The three layers

### Layer 1 — Data, translated (`src/contract`, `src/layer1`)

The common `Product` contract plus the `ProductMapper<TSource>` interface — implement once per platform. Example mappers for **SAP Commerce (OCC)** and **Shopify** are included.

```ts
import { MaitchSearch, sapCommerceMapper } from "maitch-search";

const maitch = new MaitchSearch();
await maitch.engine.ingest(occProducts, sapCommerceMapper); // push the catalogue
```

### Layer 2 — Meaning, stored (`src/layer2`)

Each product is decomposed into **typed chunks** (`identity`, `description`, `specs`, `variants`, `policies`), embedded, and stored in a **vector store** — mAItch's own DB for this module.

- `EmbeddingProvider` is pluggable: a deterministic `LocalEmbeddingProvider` (zero external services — used by dev/demo/tests) and a `VoyageEmbeddingProvider` for production-quality semantic recall.
- `VectorStore` is pluggable: `InMemoryVectorStore` (with JSON persistence) ships by default; the interface is four methods, so pgvector/Qdrant/OpenSearch adapters drop in without touching anything else.

### Layer 3 — Tools, exposed (`src/layer3`)

Four tools — **search**, **compatibility**, **policy**, **basket** — exposed over two transports:

| Transport | For | Entry point |
|---|---|---|
| REST | the storefront search-box toggle | `createHttpServer(maitch)` |
| MCP | any AI agent (Claude, ChatGPT, …) | `createMcpServer(maitch)` / `maitch-mcp` bin |

The `BasketAdapter` and `PolicyProvider` interfaces let you delegate checkout and policies to the commerce engine of record.

## The search agent (`src/agent`)

The agent runs the intent loop on top of the engine:

1. Embed the (query + any answers) → retrieve a candidate pool from the vector store.
2. A **planner** (Claude `claude-opus-4-8` with structured outputs) decides: ask **one smart question** with tappable options, or deliver **exactly three matches**, each with a shopper-facing reason.
3. Hard guarantees enforced in code, not trusted to the model:
   - **two questions maximum per session** (the session store tracks the budget),
   - **exactly three results** (validated against the candidate pool, padded if the model under-selects),
   - planner outage or a missing `ANTHROPIC_API_KEY` **degrades gracefully** to top-3 vector matches — the search box never breaks.

### FE contract (one REST call, same as legacy)

```http
POST /api/v1/search        { "query": "headphones for long flights" }
→ { "type": "question", "sessionId": "…", "question": "What's your budget?",
    "options": ["under €50", "€50–150", "€150+"], "questionNumber": 1 }

POST /api/v1/search        { "sessionId": "…", "answer": "€150+" }
→ { "type": "results", "sessionId": "…", "rationale": "…",
    "results": [ { "product": …, "score": 0.93, "reason": "…" }, ×3 ] }
```

Other endpoints: `POST /api/v1/compatibility`, `GET /api/v1/policy`, `POST /api/v1/basket`, `GET /api/v1/products/:id`, `GET /health`.

## Quick start

```bash
npm install
npm test          # 23 tests, no network or API key needed
npm run demo      # ingest the sample catalogue, run search turns in the terminal
npm run serve     # REST API on :8787 with the sample catalogue
```

```bash
curl -X POST localhost:8787/api/v1/search \
  -H 'content-type: application/json' \
  -d '{"query": "noise cancelling headphones for flights"}'
```

To enable the Claude planner (clarifying questions + LLM ranking):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run serve
```

To expose the catalogue to an MCP client (e.g. Claude Desktop / Claude Code):

```bash
MAITCH_CATALOG=./examples/catalog.json npm run mcp
```

## Configuration surface

```ts
const maitch = new MaitchSearch({
  embeddings: new VoyageEmbeddingProvider({ model: "voyage-3.5" }), // prod embeddings
  vectorStore: new InMemoryVectorStore(),                            // or your adapter
  policyProvider: new StaticPolicyProvider({ returns: "30 days" }),
  basketAdapter: myCommerceCartAdapter,                              // delegate checkout
  agent: { planner: new AnthropicPlanner({ model: "claude-opus-4-8" }) },
});
```

## Project layout

```
src/
  contract/product.ts        Layer 1 — Product contract + ProductMapper<T>
  layer1/mappers/            SAP Commerce + Shopify example mappers
  layer2/chunks.ts           typed chunks
  layer2/embeddings.ts       EmbeddingProvider (local hash + Voyage)
  layer2/vector-store.ts     VectorStore (in-memory + JSON persistence)
  engine.ts                  ingest + meaning-based retrieval
  layer3/tools.ts            search · compatibility · policy · basket
  layer3/mcp-server.ts       MCP transport (+ mcp-stdio.ts bin)
  agent/                     search agent, planner (Claude / heuristic), sessions
  server/http.ts             REST transport (the search-box toggle path)
examples/                    sample catalogue, demo, REST server
test/                        node:test suite
```
