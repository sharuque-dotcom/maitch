/**
 * Run the mAItch REST API with the sample catalogue:
 *
 *   npm run serve
 *   curl -X POST localhost:8787/api/v1/search -H 'content-type: application/json' \
 *        -d '{"query": "headphones for long flights"}'
 */
import { readFile } from "node:fs/promises";
import { createHttpServer, MaitchSearch, StaticPolicyProvider, type Product } from "../src/index.js";

const products = JSON.parse(
  await readFile(new URL("./catalog.json", import.meta.url), "utf8"),
) as Product[];

const maitch = new MaitchSearch({
  policyProvider: new StaticPolicyProvider({
    returns: "Free returns within 30 days, unworn and in original packaging.",
    shipping: "Free standard shipping over €50; express available at checkout.",
  }),
});
await maitch.engine.ingestProducts(products);

const port = Number(process.env.PORT ?? 8787);
createHttpServer(maitch).listen(port, () => {
  console.log(`mAItch Search listening on http://localhost:${port} (${products.length} products)`);
});
