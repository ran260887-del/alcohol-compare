// משקאות הטורקי: product list from the sitemap, price from the product page's JSON-LD.
import assert from "node:assert/strict";

const H = "https://www.haturki.com";
const loc = (slug) => `<url><loc>${H}/product/${slug}</loc></url>`;
const pages = {
  "/sitemap.xml": `<sitemapindex><sitemap><loc>${H}/sitemap.xml?page=1</loc></sitemap><sitemap><loc>${H}/sitemap.xml?page=2</loc></sitemap></sitemapindex>`,
  "/sitemap.xml?page=1": `<urlset><url><loc>${H}/נגישות</loc></url>${loc("בלוגה-ליטר")}${loc("בלוגה-700-מל")}</urlset>`,
  "/sitemap.xml?page=2": `<urlset>${loc("בלוגה-גולד-ליין")}${loc("וודקה-בלוגה-1-75-ליטר")}${loc("אבסולוט-ליטר")}</urlset>`,
};
const ld = (name, price, stock = "InStock") => `<html><script type="application/ld+json">{"@type":"BreadcrumbList"}</script><script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"${name}","offers":{"@type":"Offer","priceCurrency":"ILS","price":"${price}","availability":"https://schema.org/${stock}"}}</script></html>`;
const products = { "בלוגה-ליטר": ld("וודקה בלוגה ליטר", 145), "בלוגה-700-מל": ld('וודקה בלוגה 700 מ\\"ל', 119), "בלוגה-גולד-ליין": ld("וודקה בלוגה גולד ליין", 349), "וודקה-בלוגה-1-75-ליטר": ld("וודקה בלוגה 1.75 ליטר", 299, "OutOfStock") };
let productFetches = 0;
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname !== "www.haturki.com") return Response.json([]);
  const key = decodeURIComponent(u.pathname) + u.search;
  if (pages[key]) return new Response(pages[key]);
  const slug = decodeURIComponent(u.pathname).replace("/product/", "");
  if (products[slug]) { productFetches++; return new Response(products[slug]); }
  return new Response("not found", { status: 404 });
};

const { comparePrices } = await import("../netlify/lib/compare.mjs");
const d = await comparePrices("בלוגה ליטר", ["turki"]);
assert.equal(d.stores[0].status, "ok");
assert.deepEqual(d.items.map((i) => [i.name, i.price, i.match, i.in_stock]),
  [["וודקה בלוגה ליטר", 145, "exact", true], ['וודקה בלוגה 700 מ"ל', 119, "close", true], ["וודקה בלוגה 1.75 ליטר", 299, "close", false]]);
assert.ok(d.other.some((o) => /גולד/.test(o.name)));
assert.ok(!d.items.some((i) => /אבסולוט/.test(i.name)));
const before = productFetches;
await comparePrices("בלוגה ליטר", ["turki"]); // sitemap is cached, only product pages fetched again
assert.equal(productFetches - before, 4);
console.log("✓ sitemap catalog (משקאות הטורקי)");
