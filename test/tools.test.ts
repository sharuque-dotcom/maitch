import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MaitchSearch } from "../src/maitch.js";
import { StaticPolicyProvider } from "../src/layer3/tools.js";
import type { Product } from "../src/contract/product.js";

const catalog = JSON.parse(
  await readFile(new URL("../examples/catalog.json", import.meta.url), "utf8"),
) as Product[];

async function build(): Promise<MaitchSearch> {
  const maitch = new MaitchSearch({
    policyProvider: new StaticPolicyProvider({ returns: "30-day free returns" }),
  });
  await maitch.engine.ingestProducts(catalog);
  return maitch;
}

test("search tool caps results at three", async () => {
  const maitch = await build();
  const results = await maitch.tools.search("headphones", 10);
  assert.ok(results.length <= 3);
});

test("compatibility: declared worksWith link", async () => {
  const maitch = await build();
  const result = await maitch.tools.compatibility("ACC-CASE-700", "HP-ANC-700");
  assert.equal(result.compatible, true);
});

test("compatibility: shared standards", async () => {
  const maitch = await build();
  const result = await maitch.tools.compatibility("HP-ANC-700", "HP-SPT-200");
  assert.equal(result.compatible, true);
  assert.ok(result.reasons.some((r) => r.includes("USB-C")));
});

test("compatibility: no data → unknown", async () => {
  const maitch = await build();
  const result = await maitch.tools.compatibility("HP-BGT-50", "HP-KID-10");
  assert.equal(result.compatible, "unknown");
});

test("policy: per-product overrides beat catalogue defaults", async () => {
  const maitch = await build();
  assert.equal(await maitch.tools.policy("returns"), "30-day free returns");
  assert.equal(await maitch.tools.policy("warranty", "HP-ANC-700"), "2-year manufacturer warranty");
  assert.equal(await maitch.tools.policy("shipping"), undefined);
});

test("basket: add, merge quantities, remove", async () => {
  const maitch = await build();
  await maitch.tools.basketAdd("s1", { productId: "HP-ANC-700", quantity: 1 });
  let basket = await maitch.tools.basketAdd("s1", { productId: "HP-ANC-700", quantity: 2 });
  assert.deepEqual(basket, [{ productId: "HP-ANC-700", quantity: 3 }]);
  basket = await maitch.tools.basketRemove("s1", "HP-ANC-700");
  assert.deepEqual(basket, []);
  await assert.rejects(
    () => maitch.tools.basketAdd("s1", { productId: "NOPE", quantity: 1 }),
    /unknown product/,
  );
});
