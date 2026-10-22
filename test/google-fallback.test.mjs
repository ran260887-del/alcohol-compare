// When היבואן blocks the server (403), prices come from Google's index of its pages.
import assert from "node:assert/strict";

process.env.GOOGLE_API_KEY = "test"; process.env.GOOGLE_CX = "test";
let googleQuery = "";
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname === "www.the-importer.co.il") return new Response("blocked", { status: 403 });
  if (u.hostname === "www.googleapis.com") {
    googleQuery = u.searchParams.get("q");
    return Response.json({ items: [
      { title: "ייגרמייסטר ליטר | היבואן", link: "https://www.the-importer.co.il/x", pagemap: { metatags: [{ "og:title": "ייגרמייסטר ליטר", "product:price:amount": "117.90" }] } },
      { title: "בלוג על יגרמייסטר", link: "https://www.the-importer.co.il/blog", pagemap: { metatags: [{}] } },
    ] });
  }
  return Response.json([]);
};

const { comparePrices } = await import("../netlify/lib/compare.mjs");
const d = await comparePrices("ייגרמייסטר ליטר", ["importer"]);
assert.match(googleQuery, /^site:the-importer\.co\.il \(/);
assert.equal(d.stores[0].status, "ok");
assert.equal(d.stores[0].source, "google");
assert.deepEqual(d.items.map((i) => [i.name, i.price, i.match, i.via_google]), [["ייגרמייסטר ליטר", 117.9, "exact", true]]);

delete process.env.GOOGLE_API_KEY;
const d2 = await comparePrices("ייגרמייסטר ליטר", ["importer"]);
assert.equal(d2.stores[0].status, "blocked");
console.log("✓ Google fallback for blocked store");

// pasted values with spaces, quotes or a full link still work
const { googleCreds } = await import("../netlify/lib/stores.mjs");
process.env.GOOGLE_API_KEY = '  "AIzaTEST"  '; process.env.GOOGLE_CX = " https://cse.google.com/cse?cx=a7f4ed8f4c283419a ";
assert.deepEqual(googleCreds(), { key: "AIzaTEST", cx: "a7f4ed8f4c283419a" });
process.env.GOOGLE_CX = "cx=a7f4ed8f4c283419a";
assert.equal(googleCreds().cx, "a7f4ed8f4c283419a");
console.log("✓ forgiving Google values");
