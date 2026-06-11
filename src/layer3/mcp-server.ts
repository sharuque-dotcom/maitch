/**
 * MCP surface — the same Layer 3 tools exposed to ANY AI agent
 * (Claude, ChatGPT, Google Shopping, future agents) over the
 * Model Context Protocol.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MaitchSearch } from "../maitch.js";

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createMcpServer(maitch: MaitchSearch): McpServer {
  const server = new McpServer({ name: "maitch-search", version: "0.1.0" });

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Meaning-based product search over the catalogue. Returns at most three best matches with relevance scores. Use natural-language intent, not keywords.",
      inputSchema: {
        query: z.string().describe("The shopper's intent in natural language"),
      },
    },
    async ({ query }) => asText(await maitch.tools.search(query)),
  );

  server.registerTool(
    "check_compatibility",
    {
      title: "Check compatibility",
      description: "Check whether two catalogue products are compatible with each other.",
      inputSchema: {
        productId: z.string(),
        withProductId: z.string(),
      },
    },
    async ({ productId, withProductId }) =>
      asText(await maitch.tools.compatibility(productId, withProductId)),
  );

  server.registerTool(
    "get_policy",
    {
      title: "Get policy",
      description:
        "Get the returns, warranty, or shipping policy — catalogue-wide or for a specific product.",
      inputSchema: {
        topic: z.enum(["returns", "warranty", "shipping"]),
        productId: z.string().optional(),
      },
    },
    async ({ topic, productId }) => {
      const policy = await maitch.tools.policy(topic, productId);
      return asText({ topic, policy: policy ?? null });
    },
  );

  server.registerTool(
    "basket",
    {
      title: "Basket",
      description: "Add to, remove from, or view the shopper's basket for a session.",
      inputSchema: {
        action: z.enum(["add", "remove", "get"]),
        sessionId: z.string(),
        productId: z.string().optional(),
        variantId: z.string().optional(),
        quantity: z.number().int().positive().optional(),
      },
    },
    async ({ action, sessionId, productId, variantId, quantity }) => {
      if (action === "add") {
        if (!productId) throw new Error("productId is required for add");
        return asText(
          await maitch.tools.basketAdd(sessionId, { productId, variantId, quantity: quantity ?? 1 }),
        );
      }
      if (action === "remove") {
        if (!productId) throw new Error("productId is required for remove");
        return asText(await maitch.tools.basketRemove(sessionId, productId, variantId));
      }
      return asText(await maitch.tools.basketGet(sessionId));
    },
  );

  return server;
}
