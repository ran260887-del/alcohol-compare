// Runs one query against all stores and returns sorted, matched offers.
import { STORES } from "./stores.mjs";
import { compare, searchTerms, parseSize } from "./match.mjs";

export async function comparePrices(query, storeIds) {
  const stores = STORES.filter((s) => !storeIds || storeIds.includes(s.id));
  const terms = searchTerms(query);

  const perStore = await Promise.all(stores.map(async (s) => {
    const seen = new Map();
    let ok = 0, lastError = null;
    // all spellings at once; a store answers in ~1s
    if (s.searchByQuery) {
      try { for (const p of await s.searchByQuery(query)) seen.set(p.url || p.name, p); ok = 1; } catch (e) { lastError = e; }
    } else {
      // two spellings at once; the rest only if those found nothing (fewer requests, fewer timeouts)
      const run = (list) => Promise.all(list.map(async (t) => {
        try { for (const p of await s.search(t)) seen.set(p.url || p.name, p); ok++; } catch (e) { lastError = e; }
      }));
      await run(terms.slice(0, 2));
      const hit = [...seen.values()].some((p) => compare(query, p.name, p.size_ml));
      if (!hit && terms.length > 2) await run(terms.slice(2));
    }
    let source = "store";
    if (!ok && s.fallback) {
      try { for (const p of await s.fallback(terms)) seen.set(p.url || p.name, p); ok = 1; source = "google"; }
      catch (e) { if (!/not configured/.test(e.message)) lastError = { status: 403, message: "HTTP 403; " + e.message }; }
    }
    if (!ok) return { store: s, status: lastError?.status === 403 ? "blocked" : "fail", error: String(lastError?.message || lastError), offers: [] };

    const offers = [];
    for (const p of seen.values()) {
      const c = compare(query, p.name, p.size_ml);
      if (c) offers.push({ ...p, ...c, store: s.name, store_id: s.id });
    }
    const hits = offers.filter((o) => o.match !== "other");
    return { store: s, status: hits.length ? "ok" : "none", source, offers };
  }));

  const all = perStore.flatMap((r) => r.offers);

  // No size typed: compare like for like. Pick the usual bottle (700/750 ml, else 1 L, else the most common size)
  // and show other sizes as partial matches, so a 200 ml bottle is not "the cheapest".
  if (!parseSize(query)) {
    const sizes = all.filter((o) => o.match === "exact" && o.size_ml).map((o) => o.size_ml);
    if (new Set(sizes).size > 1) {
      const has = (n) => sizes.includes(n);
      const count = (n) => sizes.filter((x) => x === n).length;
      const target = has(700) || has(750) ? [700, 750] : has(1000) ? [1000] : [[...new Set(sizes)].sort((a, b) => count(b) - count(a))[0]];
      for (const o of all) if (o.match === "exact" && o.size_ml && !target.includes(o.size_ml)) { o.match = "close"; o.note = "גודל אחר"; }
    }
  }
  const rank = { exact: 0, close: 1, other: 2 };
  all.sort((a, b) => rank[a.match] - rank[b.match] || a.price - b.price);

  return {
    query,
    terms,
    checked_at: new Date().toISOString(),
    stores: perStore.map((r) => ({ id: r.store.id, name: r.store.name, status: r.status, source: r.source, error: r.error, search_url: r.store.searchUrl(terms[0] || query) })),
    items: all.filter((o) => o.match !== "other"),
    other: all.filter((o) => o.match === "other").slice(0, 20),
  };
}
