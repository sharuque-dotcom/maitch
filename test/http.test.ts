import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { MaitchSearch } from "../src/maitch.js";
import { createHttpServer } from "../src/server/http.js";
import type { Product } from "../src/contract/product.js";

const catalog = JSON.parse(
  await readFile(new URL("../examples/catalog.json", import.meta.url), "utf8"),
) as Product[];

const maitch = new MaitchSearch();
await maitch.engine.ingestProducts(catalog);
const server = createHttpServer(maitch);
await new Promise<void>((resolve) => server.listen(0, resolve));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

after(() => server.close());

test("GET /health reports product count", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.products, catalog.length);
});

test("POST /api/v1/search is a single REST call returning structured results", async () => {
  const res = await fetch(`${base}/api/v1/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "noise cancelling headphones for flights" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, "results");
  assert.equal(body.results.length, 3);
  assert.ok(body.sessionId);
});

test("GET /api/v1/products/:id and 404 for unknown", async () => {
  const ok = await fetch(`${base}/api/v1/products/HP-ANC-700`);
  assert.equal(ok.status, 200);
  const missing = await fetch(`${base}/api/v1/products/NOPE`);
  assert.equal(missing.status, 404);
});

test("policy and basket endpoints", async () => {
  const policy = await fetch(`${base}/api/v1/policy?topic=warranty&productId=HP-ANC-700`);
  assert.equal((await policy.json()).policy, "2-year manufacturer warranty");

  const add = await fetch(`${base}/api/v1/basket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "s1", action: "add", productId: "HP-ANC-700" }),
  });
  assert.equal(add.status, 200);
  assert.deepEqual((await add.json()).basket, [{ productId: "HP-ANC-700", quantity: 1 }]);

  const bad = await fetch(`${base}/api/v1/basket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "s1", action: "explode" }),
  });
  assert.equal(bad.status, 400);
});

test("malformed JSON returns 400", async () => {
  const res = await fetch(`${base}/api/v1/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
});
