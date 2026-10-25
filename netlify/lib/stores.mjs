// One adapter per store. Each `search(term)` returns [{name, price, regular_price, size_ml, in_stock, url}].
import { decodeEntities, parseSize, compare } from "./match.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 7000;

async function get(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8", Accept: opts.accept || "*/*", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) { const e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
  return res;
}

const num = (s) => Number(String(s).replace(/&nbsp;|&#8362;|₪|,|\s/g, "").replace(/[^\d.]/g, ""));

// WooCommerce search results page (when the JSON API is off): read the product cards from the HTML.
export function parseWooHtml(html, origin) {
  const out = [];
  const cards = html.split(/<(?:li|div)\b[^>]*\bclass="[^"]*\btype-product\b/).slice(1);
  for (const raw of cards) {
    const c = raw.split(/<footer|elementor-location-footer|site-footer/)[0]
      .replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
    const text = (h) => decodeEntities(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const isNoise = (t) => !t || t.length < 3 || /ל\s*-?\s*100|^₪|^\d|הוספה לסל|מבצע|הנחה/.test(t);
    // title: the loop/product title, else the first heading that is not a price line, else the image alt
    const heads = [...c.matchAll(/class="[^"]*(?:woocommerce-loop-product__title|product_title|product-title|elementor-heading-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|a|div|span|p)>/g)].map((m) => text(m[1]));
    let name = heads.find((t) => !isNoise(t));
    if (!name) name = text((c.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/) || [])[1]);
    if (isNoise(name)) name = text((c.match(/<img[^>]+alt="([^"]+)"/) || [])[1]).replace(/^בקבוק\s+/, "");
    if (isNoise(name)) continue;
    // price: sale price in <ins>, else the first amount; if the theme prints prices as plain text, read "₪ 119" / "119 ₪"
    const amt = (h) => num(text(h));
    const ins = c.match(/<ins[^>]*>([\s\S]*?)<\/ins>/);
    const del = c.match(/<del[^>]*>([\s\S]*?)<\/del>/);
    const amounts = [...c.matchAll(/woocommerce-Price-amount[^>]*>([\s\S]*?)<\/span>\s*<\/(?:bdi|span)>|woocommerce-Price-amount[^>]*><bdi>([\s\S]*?)<\/bdi>/g)]
      .map((m) => amt(m[1] || m[2])).filter((n) => n > 0);
    let price = ins ? amt(ins[1]) : amounts[0];
    if (!(price > 0)) {
      const plain = text(c).replace(/[\d.]+\s*ש"ח\s*ל\s*-?\s*100\s*מ"ל/g, " ");
      const m = plain.match(/₪\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:₪|ש"ח)/);
      price = m ? num(m[1] || m[2]) : 0;
    }
    if (!(price > 0)) continue;
    const reg = del ? amt(del[1]) : 0;
    const link = (c.match(/href="([^"]*\/product\/[^"]*)"/) || c.match(/href="(https?:\/\/[^"#]+)"/) || [])[1];
    out.push({ name, price, regular_price: reg > price ? reg : 0, size_ml: parseSize(name), in_stock: !/\boutofstock\b/.test(raw.slice(0, 600)) && !/אזל מהמלאי/.test(text(c)),
      url: link ? decodeEntities(link) : origin });
  }
  const seen = new Set();
  return out.filter((p) => !seen.has(p.url + p.name) && seen.add(p.url + p.name));
}

// WooCommerce "Store API" — public JSON that WordPress shops expose for their own search box.
function woo(origin) {
  return async (term) => {
    let list;
    try {
      const res = await get(`${origin}/wp-json/wc/store/v1/products?per_page=40&search=${encodeURIComponent(term)}`, { accept: "application/json" });
      list = JSON.parse(await res.text());
    } catch (e) {
      if (e.status === 403) throw e;
      // JSON API off or returns a web page: read the normal search page instead
      const res = await get(`${origin}/?s=${encodeURIComponent(term)}&post_type=product`, { accept: "text/html" });
      return parseWooHtml(await res.text(), origin);
    }
    if (!Array.isArray(list)) return [];
    return list.map((p) => {
      const unit = 10 ** (p.prices?.currency_minor_unit ?? 2);
      const price = Number(p.prices?.price) / unit;
      const reg = Number(p.prices?.regular_price) / unit;
      const name = decodeEntities(p.name).replace(/<[^>]+>/g, "").trim();
      return { name, price, regular_price: reg > price ? reg : 0, size_ml: parseSize(name), in_stock: p.is_in_stock !== false, url: p.permalink };
    }).filter((x) => x.price > 0);
  };
}

// Magento 2 GraphQL (היבואן).
function magento(origin) {
  return async (term) => {
    const q = `{products(search:${JSON.stringify(term)},pageSize:40){items{name url_key url_suffix stock_status price_range{minimum_price{regular_price{value} final_price{value}}}}}}`;
    const res = await get(`${origin}/graphql?query=${encodeURIComponent(q)}`, { accept: "application/json" });
    const j = await res.json();
    return (j?.data?.products?.items || []).map((p) => {
      const price = p.price_range?.minimum_price?.final_price?.value;
      const reg = p.price_range?.minimum_price?.regular_price?.value;
      const name = decodeEntities(p.name).trim();
      return { name, price, regular_price: reg > price ? reg : 0, size_ml: parseSize(name), in_stock: p.stock_status !== "OUT_OF_STOCK",
        url: `${origin}/${encodeURI(p.url_key)}${p.url_suffix || ""}` };
    }).filter((x) => x.price > 0);
  };
}

// אליאסי: server-rendered HTML search page.
async function eliasi(term) {
  const origin = "https://www.eliasi.co.il";
  const res = await get(`${origin}/index.php?dir=site&page=search&q=${encodeURIComponent(term)}`, { accept: "text/html" });
  const html = await res.text();
  const out = [];
  for (const p of html.split(/<div class="products__block products__block_cat"/).slice(1)) {
    const price = (p.match(/data-sort-price="([\d.]+)"/) || [])[1];
    const href = (p.match(/class="products__info"\s+href="([^"]+)"/) || [])[1];
    const name = (p.match(/products__title_inner">\s*<p>([\s\S]*?)<\/p>/) || [])[1];
    const cap = (p.match(/extra-capacity-txt="([^"]*)"/) || [])[1];
    if (!price || !name) continue;
    const full = decodeEntities(name).replace(/<[^>]+>/g, "").trim();
    const soldOut = /אזל מהמלאי/.test(full);
    const clean = full.replace(/\s*-?\s*אזל מהמלאי\s*/, "").trim();
    out.push({ name: clean, price: +price, regular_price: 0, size_ml: parseSize(decodeEntities(cap || "")) || parseSize(clean), in_stock: !soldOut,
      url: href ? origin + decodeEntities(href).replace(/^(?!\/)/, "/") : `${origin}/index.php?dir=site&page=search&q=${encodeURIComponent(term)}` });
  }
  return out;
}

// Reads the two Google values, forgiving pasted spaces, quotes, "cx=" or a whole cse.google.com link.
export function googleCreds() {
  const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();
  const key = clean(process.env.GOOGLE_API_KEY);
  let cx = clean(process.env.GOOGLE_CX);
  const m = cx.match(/cx=([^&\s]+)/); if (m) cx = m[1];
  cx = cx.replace(/^cx\s*[:=]\s*/i, "");
  return { key, cx };
}

// Fallback for a store that blocks servers: read the prices Google has indexed for its product pages,
// through Google's official Custom Search API. Needs GOOGLE_API_KEY and GOOGLE_CX in Netlify's environment variables.
export function googleIndex(domain) {
  return async (terms) => {
    const { key, cx } = googleCreds();
    if (!key || !cx) { const e = new Error("Google fallback not configured"); e.status = 403; throw e; }
    const q = `site:${domain} (${terms.slice(0, 3).map((t) => `"${t}"`).join(" OR ")})`;
    const base = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}`;
    let res = await fetch(base + "&num=10&gl=il", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 400) res = await fetch(base, { signal: AbortSignal.timeout(TIMEOUT_MS) }); // retry with only the required fields
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error("Google " + res.status + ": " + (j.error?.message || "error")); e.status = 502; throw e; }
    return (j.items || []).map((it) => {
      const meta = it.pagemap?.metatags?.[0] || {};
      const offer = it.pagemap?.offer?.[0] || {};
      const price = num(meta["product:price:amount"] || meta["og:price:amount"] || offer.price || "");
      const name = decodeEntities(meta["og:title"] || it.title || "").replace(/\s*[|\-–]\s*היבואן.*$/, "").trim();
      return { name, price, regular_price: 0, size_ml: parseSize(name), in_stock: true, url: it.link, via_google: true };
    }).filter((x) => x.price > 0 && x.name);
  };
}

// Product pages that carry schema.org JSON-LD (name, price, stock).
export function parseJsonLdProduct(html, url) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let data; try { data = JSON.parse(m[1]); } catch { continue; }
    const list = [].concat(data["@graph"] || data);
    const p = list.find((x) => x && /Product/.test(x["@type"]));
    if (!p) continue;
    const offers = [].concat(p.offers || []);
    const o = offers[0] || {};
    const price = num(o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? "");
    if (!(price > 0)) continue;
    const name = decodeEntities(p.name || "").trim();
    return { name, price, regular_price: 0, size_ml: parseSize(name), in_stock: !/OutOfStock|SoldOut/i.test(String(o.availability || "")), url };
  }
  return null;
}

// Stores whose own search can't be called from a server: match against the product list in their sitemap
// (product names are in the addresses), then read the price from the few matching product pages.
function sitemapCatalog(origin) {
  let cache = null, cachedAt = 0;
  async function products() {
    if (cache && Date.now() - cachedAt < 6 * 3600e3) return cache;
    const index = await (await get(`${origin}/sitemap.xml`, { accept: "application/xml" })).text();
    let pages = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
    if (!/<sitemapindex/.test(index)) pages = [`${origin}/sitemap.xml`];
    const xmls = await Promise.all(pages.slice(0, 20).map((u) => get(u, { accept: "application/xml" }).then((r) => r.text()).catch(() => "")));
    const out = [];
    for (const x of xmls) for (const m of x.matchAll(/<loc>([^<]*\/product\/[^<]+)<\/loc>/g)) {
      const url = decodeEntities(m[1]).trim();
      let slug = url.split("/product/")[1].replace(/\/$/, "");
      try { slug = decodeURIComponent(slug); } catch {}
      out.push({ url, name: slug.replace(/-(\d+)-(\d+)-/g, " $1.$2 ").replace(/-/g, " ") });
    }
    if (out.length) { cache = out; cachedAt = Date.now(); }
    return out;
  }
  return async (query) => {
    const list = await products();
    if (!list.length) throw new Error("empty sitemap");
    const rank = { exact: 0, close: 1, other: 2 };
    const candidates = list.map((p) => ({ p, c: compare(query, p.name) })).filter((x) => x.c)
      .sort((a, b) => rank[a.c.match] - rank[b.c.match]).slice(0, 10);
    const pages = await Promise.all(candidates.map(({ p }) =>
      get(encodeURI(p.url), { accept: "text/html", timeout: 6000 }).then((r) => r.text()).then((h) => parseJsonLdProduct(h, p.url)).catch(() => null)));
    return pages.filter(Boolean);
  };
}

// Konimbo shops (Wine & More): server-rendered search page.
function konimbo(origin) {
  return async (term) => {
    const html = await (await get(`${origin}/search?q=${encodeURIComponent(term)}`, { accept: "text/html" })).text();
    const out = [];
    for (const c of html.split(/<div id="item_id_\d+"/).slice(1)) {
      const text = (h) => decodeEntities(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const name = text((c.match(/<p class='title[^']*'>([\s\S]*?)<\/p>/) || [])[1]);
      const price = num(text((c.match(/<p class='price[^']*'>([\s\S]*?)<\/p>/) || [])[1]).replace(/^מחיר/, ""));
      const orig = num(text((c.match(/<p class='origin_price[^']*'>([\s\S]*?)<\/p>/) || [])[1]));
      const href = (c.match(/href='\s*([^'\s]+)\s*'/) || [])[1];
      if (!name || !(price > 0)) continue;
      out.push({ name, price, regular_price: orig > price ? orig : 0, size_ml: parseSize(name), in_stock: !/out_of_stock|אזל מהמלאי/.test(c), url: href ? origin + href : origin });
    }
    return out;
  };
}

// Old ASP shops that expect Hebrew in the Windows-1255 code page (בית המשקאות של נפתלי).
const cp1255 = (s) => [...s].map((ch) => { const c = ch.charCodeAt(0); return c >= 0x5d0 && c <= 0x5ea ? "%" + (c - 0x5d0 + 0xe0).toString(16).toUpperCase() : encodeURIComponent(ch); }).join("");
function naftali(origin) {
  return async (term) => {
    const res = await get(`${origin}/items.asp?IsPostback=true&Qsearch=${cp1255(term)}&stype=M`, { accept: "text/html" });
    const html = new TextDecoder("windows-1255").decode(await res.arrayBuffer());
    const out = [], seen = new Set();
    for (const m of html.matchAll(/<a\b[^>]*\bee_list_itemname="[^"]*"[^>]*>/g)) {
      const attr = (k) => decodeEntities((m[0].match(new RegExp(k + "=[\"']([^\"']*)[\"']")) || [])[1] || "");
      const id = attr("ee_list_itemid"), name = attr("ee_list_itemname").trim(), price = num(attr("ee_list_itemprice"));
      if (!name || !(price > 0) || seen.has(id)) continue;
      seen.add(id);
      const reg = num((html.match(new RegExp('id="totalreg' + id + '">([\\d.,]+)')) || [])[1] || "");
      const href = attr("href");
      out.push({ name, price, regular_price: reg > price ? reg : 0, size_ml: parseSize(name), in_stock: true, url: href ? origin + encodeURI(href) : origin });
    }
    return out;
  };
}

export const STORES = [
  { id: "bana", name: "בנא משקאות", site: "https://www.banamashkaot.co.il", searchUrl: (q) => `https://www.banamashkaot.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://www.banamashkaot.co.il") },
  { id: "importer", name: "היבואן", site: "https://www.the-importer.co.il", searchUrl: (q) => `https://www.the-importer.co.il/catalogsearch/result/?q=${encodeURIComponent(q)}`, search: magento("https://www.the-importer.co.il"), fallback: googleIndex("the-importer.co.il") },
  { id: "turki", name: "משקאות הטורקי", site: "https://www.haturki.com", searchUrl: (q) => `https://www.haturki.com/search-results?q=${encodeURIComponent(q)}`, searchByQuery: sitemapCatalog("https://www.haturki.com") },
  { id: "eliasi", name: "אליאסי", site: "https://www.eliasi.co.il", searchUrl: (q) => `https://www.eliasi.co.il/index.php?dir=site&page=search&q=${encodeURIComponent(q)}`, search: eliasi },
  { id: "winehouse", name: "בית היין", site: "https://winehouse.co.il", searchUrl: (q) => `https://winehouse.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://winehouse.co.il") },
  { id: "wineroute", name: "דרך היין", site: "https://www.wineroute.co.il", searchUrl: (q) => `https://www.wineroute.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://www.wineroute.co.il") },
  { id: "naftali", name: "בית המשקאות של נפתלי", site: "https://www.goodwines.co.il", searchUrl: (q) => `https://www.goodwines.co.il/items.asp?IsPostback=true&Qsearch=${cp1255(q)}&stype=M`, search: naftali("https://www.goodwines.co.il") },
  { id: "drinkcenter", name: "דרינק סנטר", site: "https://www.drinkcenter.co.il", searchUrl: (q) => `https://www.drinkcenter.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://www.drinkcenter.co.il") },
  { id: "hamesameach", name: "משקאות המשמח", site: "https://www.hamesameach.co.il", searchUrl: (q) => `https://www.hamesameach.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://www.hamesameach.co.il") },
  { id: "alcohome", name: "אלכוהום", site: "https://alcohome.co.il", searchUrl: (q) => `https://alcohome.co.il/?s=${encodeURIComponent(q)}&post_type=product`, search: woo("https://alcohome.co.il") },
  { id: "wineandmore", name: "Wine & More", site: "https://www.wineandmore.co.il", searchUrl: (q) => `https://www.wineandmore.co.il/search?q=${encodeURIComponent(q)}`, search: konimbo("https://www.wineandmore.co.il") },
];
