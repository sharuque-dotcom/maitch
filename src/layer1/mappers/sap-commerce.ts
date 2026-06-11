import type { Product, ProductMapper } from "../../contract/product.js";

/**
 * Example mapper for SAP Commerce (hybris) products, as returned by the OCC
 * product API. The whole catalogue is pushed through this mapper into the
 * mAItch store — Solr is not involved (see the "toggle on the search box"
 * model: legacy path → Solr, mAItch path → this store).
 */
export interface SapCommerceProduct {
  code: string;
  name: string;
  summary?: string;
  description?: string;
  manufacturer?: string;
  categories?: Array<{ code: string; name?: string }>;
  price?: { value: number; currencyIso: string };
  classifications?: Array<{
    name?: string;
    features?: Array<{ name: string; featureValues?: Array<{ value: string }> }>;
  }>;
  stock?: { stockLevelStatus?: string };
  url?: string;
  images?: Array<{ format?: string; url?: string }>;
}

export const sapCommerceMapper: ProductMapper<SapCommerceProduct> = {
  source: "sap-commerce",
  map(item: SapCommerceProduct): Product {
    const attributes: Record<string, string> = {};
    for (const classification of item.classifications ?? []) {
      for (const feature of classification.features ?? []) {
        const value = feature.featureValues?.map((v) => v.value).join(", ");
        if (feature.name && value) attributes[feature.name.toLowerCase()] = value;
      }
    }
    return {
      id: item.code,
      title: item.name,
      description: item.description ?? item.summary,
      brand: item.manufacturer,
      category: item.categories?.map((c) => c.name ?? c.code),
      price: item.price
        ? { amount: item.price.value, currency: item.price.currencyIso }
        : undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
      inStock: item.stock ? item.stock.stockLevelStatus !== "outOfStock" : undefined,
      url: item.url,
      imageUrl: item.images?.find((i) => i.format === "product")?.url ?? item.images?.[0]?.url,
    };
  },
};
