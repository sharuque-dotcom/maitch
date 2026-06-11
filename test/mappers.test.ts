import { test } from "node:test";
import assert from "node:assert/strict";
import { sapCommerceMapper } from "../src/layer1/mappers/sap-commerce.js";
import { shopifyMapper } from "../src/layer1/mappers/shopify.js";

test("SAP Commerce mapper translates OCC shape into the Product contract", () => {
  const product = sapCommerceMapper.map({
    code: "12345",
    name: "DSLR Camera",
    description: "A camera.",
    manufacturer: "Photon",
    categories: [{ code: "cameras", name: "Cameras" }],
    price: { value: 599.99, currencyIso: "EUR" },
    classifications: [
      {
        features: [{ name: "Megapixels", featureValues: [{ value: "24" }] }],
      },
    ],
    stock: { stockLevelStatus: "inStock" },
  });
  assert.equal(product.id, "12345");
  assert.equal(product.brand, "Photon");
  assert.deepEqual(product.category, ["Cameras"]);
  assert.equal(product.price?.amount, 599.99);
  assert.equal(product.attributes?.megapixels, "24");
  assert.equal(product.inStock, true);
});

test("Shopify mapper translates variants, options and tags", () => {
  const product = shopifyMapper({ currency: "USD" }).map({
    id: 987,
    title: "Tee",
    body_html: "<p>Soft <b>cotton</b> tee</p>",
    vendor: "Looms",
    product_type: "Apparel",
    tags: "summer, cotton",
    options: [{ name: "Size", position: 1 }],
    variants: [
      { id: 1, title: "M", option1: "M", price: "19.99", inventory_quantity: 3 },
      { id: 2, title: "L", option1: "L", price: "19.99", inventory_quantity: 0 },
    ],
  });
  assert.equal(product.id, "987");
  assert.equal(product.description, "Soft cotton tee");
  assert.deepEqual(product.tags, ["summer", "cotton"]);
  assert.equal(product.variants?.length, 2);
  assert.deepEqual(product.variants?.[0]?.attributes, { size: "M" });
  assert.equal(product.variants?.[0]?.inStock, true);
  assert.equal(product.variants?.[1]?.inStock, false);
  assert.equal(product.price?.currency, "USD");
});
