// Runs the real Netlify function against recorded store responses (no network).
import assert from "node:assert/strict";

const woo = (items, minor = 0) => JSON.stringify(items.map(([name, price, stock = true]) => ({
  name, permalink: "https://x/" + encodeURIComponent(name), is_in_stock: stock,
  prices: { price: String(Math.round(price * 10 ** minor)), regular_price: String(Math.round(price * 10 ** minor)), currency_minor_unit: minor },
})));
const FIX = {
  "banamashkaot": woo([["ליקר ייגרמייסטר ליטר", 109.9], ["ליקר ייגרמייסטר 700 מ&quot;ל", 94.9]], 2),
  "winehouse": woo([["יגרמייסטר 700 מ״ל", 90], ["יגרמייסטר ליטר", 120], ["יגרמייסטר מניפסט", 110, false]]),
  "wineroute": woo([["ליקר ייגרמייסטר 700", 99.9]], 2),
  "the-importer": JSON.stringify({ data: { products: { items: [
    { name: "ייגרמייסטר ליטר", url_key: "ייגרמייסטר-ליטר", url_suffix: "", stock_status: "IN_STOCK", price_range: { minimum_price: { regular_price: { value: 117.9 }, final_price: { value: 117.9 } } } },
    { name: 'ייגרמייסטר מניפסט ליקר 500 מ"ל', url_key: "m", url_suffix: "", stock_status: "IN_STOCK", price_range: { minimum_price: { regular_price: { value: 102.9 }, final_price: { value: 102.9 } } } }] } } }),
  "eliasi": `<div class="products__block products__block_cat" data-filter-3-extra-capacity-txt="1000 מל&#039;" data-sort-price="109.9"><a class="products__info" href="/JAGERMEISTER"><div class="products__title_inner"><p>ליקר ייגרמייסטר ליטר </p></div></a></div>`,
};
globalThis.fetch = async (url) => {
  const host = new URL(url).hostname;
  if (host.includes("haturki")) throw new TypeError("fetch failed");
  const key = Object.keys(FIX).find((k) => host.includes(k));
  return new Response(FIX[key], { status: 200 });
};

const { default: handler } = await import("../netlify/functions/search.mjs");
const res = await handler(new Request("https://site/api/search?q=" + encodeURIComponent("ייגרמייסטר ליטר")));
const d = await res.json();

const exact = d.items.filter((i) => i.match === "exact").map((i) => [i.store, i.price]);
console.log(exact);
assert.deepEqual(exact, [["בנא משקאות", 109.9], ["אליאסי", 109.9], ["היבואן", 117.9], ["בית היין", 120]]);
assert.equal(d.stores.find((s) => s.id === "turki").status, "fail");
assert.equal(d.stores.find((s) => s.id === "wineroute").status, "ok"); // only 700 ml -> partial
assert.ok(d.other.some((o) => /מניפסט/.test(o.name)));
assert.ok(res.headers.get("Netlify-CDN-Cache-Control"));
console.log("✓ end-to-end with recorded responses");
