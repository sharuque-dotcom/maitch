/**
 * REST surface — the search-box toggle path.
 *
 * The front end keeps its existing pattern: one REST call from FE to BE.
 * Legacy toggle position hits Solr; mAItch toggle position hits this API.
 *
 *   POST /api/v1/search        { query } | { sessionId, answer }
 *     → { type: "question", ... } | { type: "results", results: [3] }
 *   POST /api/v1/compatibility { productId, withProductId }
 *   GET  /api/v1/policy?topic=returns[&productId=...]
 *   POST /api/v1/basket        { sessionId, action: add|remove|get, ... }
 *   GET  /api/v1/products/:id
 *   GET  /health
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MaitchSearch } from "../maitch.js";
import type { PolicyTopic } from "../layer3/tools.js";

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

export function createHttpServer(maitch: MaitchSearch): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, {});
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, { status: "ok", products: maitch.engine.listProducts().length });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v1/search") {
        const body = await readJson(req);
        const result = await maitch.agent.turn({
          query: body.query,
          sessionId: body.sessionId,
          answer: body.answer,
        });
        send(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v1/compatibility") {
        const body = await readJson(req);
        const result = await maitch.tools.compatibility(body.productId, body.withProductId);
        send(res, 200, result);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/v1/policy") {
        const topic = url.searchParams.get("topic") as PolicyTopic | null;
        if (!topic) {
          send(res, 400, { error: "topic query parameter is required" });
          return;
        }
        const policy = await maitch.tools.policy(topic, url.searchParams.get("productId") ?? undefined);
        send(res, 200, { topic, policy: policy ?? null });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v1/basket") {
        const body = await readJson(req);
        const { sessionId, action } = body;
        if (!sessionId || !action) {
          send(res, 400, { error: "sessionId and action are required" });
          return;
        }
        if (action === "add") {
          const basket = await maitch.tools.basketAdd(sessionId, {
            productId: body.productId,
            variantId: body.variantId,
            quantity: body.quantity ?? 1,
          });
          send(res, 200, { basket });
        } else if (action === "remove") {
          const basket = await maitch.tools.basketRemove(sessionId, body.productId, body.variantId);
          send(res, 200, { basket });
        } else if (action === "get") {
          send(res, 200, { basket: await maitch.tools.basketGet(sessionId) });
        } else {
          send(res, 400, { error: `unknown basket action: ${action}` });
        }
        return;
      }

      const productMatch = url.pathname.match(/^\/api\/v1\/products\/(.+)$/);
      if (req.method === "GET" && productMatch) {
        const product = maitch.engine.getProduct(decodeURIComponent(productMatch[1]!));
        if (!product) {
          send(res, 404, { error: "product not found" });
          return;
        }
        send(res, 200, product);
        return;
      }

      send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, err instanceof SyntaxError ? 400 : 500, {
        error: err instanceof Error ? err.message : "internal error",
      });
    }
  });
}
