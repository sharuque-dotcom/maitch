import type { Product, ProductMapper } from "../../contract/product.js";

/** Example mapper for Shopify Admin API products. */
export interface ShopifyProduct {
  id: number | string;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string; // comma separated
  variants?: Array<{
    id: number | string;
    title?: string;
    price?: string;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    inventory_quantity?: number;
  }>;
  options?: Array<{ name: string; position: number }>;
  images?: Array<{ src: string }>;
  handle?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function shopifyMapper(opts?: { currency?: string }): ProductMapper<ShopifyProduct> {
  const currency = opts?.currency ?? "USD";
  return {
    source: "shopify",
    map(item: ShopifyProduct): Product {
      const optionNames = (item.options ?? [])
        .sort((a, b) => a.position - b.position)
        .map((o) => o.name);
      const variants = (item.variants ?? []).map((v) => {
        const attributes: Record<string, string> = {};
        const values = [v.option1, v.option2, v.option3];
        optionNames.forEach((name, i) => {
          const value = values[i];
          if (value) attributes[name.toLowerCase()] = value;
        });
        return {
          id: String(v.id),
          title: v.title,
          attributes: Object.keys(attributes).length ? attributes : undefined,
          price: v.price ? { amount: Number(v.price), currency } : undefined,
          inStock: v.inventory_quantity === undefined ? undefined : v.inventory_quantity > 0,
        };
      });
      const firstPrice = variants.find((v) => v.price)?.price;
      return {
        id: String(item.id),
        title: item.title,
        description: item.body_html ? stripHtml(item.body_html) : undefined,
        brand: item.vendor,
        category: item.product_type ? [item.product_type] : undefined,
        tags: item.tags
          ? item.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        variants: variants.length ? variants : undefined,
        price: firstPrice,
        inStock: variants.some((v) => v.inStock) || undefined,
        url: item.handle ? `/products/${item.handle}` : undefined,
        imageUrl: item.images?.[0]?.src,
      };
    },
  };
}
