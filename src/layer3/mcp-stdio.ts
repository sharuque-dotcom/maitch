#!/usr/bin/env node
/**
 * Stdio entrypoint for the mAItch MCP server.
 *
 * Loads a catalogue from MAITCH_CATALOG (path to a JSON array of Products in
 * the common contract) and exposes the Layer 3 tools to any MCP client:
 *
 *   MAITCH_CATALOG=./catalog.json maitch-mcp
 */
import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Product } from "../contract/product.js";
import { MaitchSearch } from "../maitch.js";
import { createMcpServer } from "./mcp-server.js";

async function main() {
  const catalogPath = process.env.MAITCH_CATALOG;
  if (!catalogPath) {
    console.error("MAITCH_CATALOG env var must point to a JSON catalogue file");
    process.exit(1);
  }
  const products = JSON.parse(await readFile(catalogPath, "utf8")) as Product[];

  const maitch = new MaitchSearch();
  await maitch.engine.ingestProducts(products);
  // stderr, not stdout — stdout carries the MCP protocol stream.
  console.error(`maitch-mcp: indexed ${products.length} products from ${catalogPath}`);

  const server = createMcpServer(maitch);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
