// Runs one query against all stores and returns sorted, matched offers.
import { STORES } from "./stores.mjs";
import { compare, searchTerms, parseSize, words, parseDeal, stripDeal } from "./match.mjs";
import { aiClassify, aiConfigured, lastAiError, usedModels } from "./ai.mjs";

// Collect raw products from one store (no matching decisions yet).
async function collect(s, query, terms) {
  const seen = new Map();
  let ok = 0, lastError = null;
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
  if (!ok) return { store: s, status: lastError?.status === 403 ? "blocked" : "fail", error: String(lastError?.message || lastError), products: [] };
  // Multi-buy deal in the name or label: match on the plain name, rank by the per-bottle deal price.
  const products = [...seen.values()].map((p) => {
    const deal = parseDeal(p.name) || parseDeal(p.promo);
    if (!deal || !(deal.unit < p.price)) return p;
    return { ...p, name: stripDeal(p.name), single_price: p.price, price: deal.unit, deal: `${deal.text} (₪${deal.unit} לבקבוק)` };
  });
  return { store: s, status: "ok", products };
}

// Size rule shared by both matchers.
function withSize(query, p, base) {
  const qSize = parseSize(query);
  const pSize = p.size_ml || parseSize(p.name);
  if (qSize && pSize && qSize !== pSize) return { match: "close", note: "גודל אחר" };
  if (qSize && !pSize) return { match: "close", note: "גודל לא צוין" };
  return base;
}

export async function comparePrices(query, storeIds) {
  const started = Date.now();
  const stores = STORES.filter((s) => !storeIds || storeIds.includes(s.id));
  const terms = searchTerms(query);
  const perStore = await Promise.all(stores.map((s) => collect(s, query, terms)));

  // Candidates for matching: every product that shares at least one meaningful word with the query.
  const qw = words(query);
  const shares = (name) => { const pw = words(name); return qw.some((w) => pw.includes(w) || pw.some((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))); };
  const cands = [];
  for (const r of perStore) for (const p of r.products) cands.push({ r, p, rule: compare(query, p.name, p.size_ml) });
  const forAi = cands.filter((c) => c.rule || shares(c.p.name)).slice(0, 100);

  let matcher = "rules";
  // Netlify ends a request after 10 s; give Gemini only the time that is left.
  const aiTime = Math.min(5000, 8800 - (Date.now() - started));
  const ai = aiConfigured() && aiTime > 1200 ? await aiClassify(query, forAi.map((c) => c.p.name), { timeoutMs: aiTime }) : null;
  if (ai) {
    matcher = "ai";
    forAi.forEach((c, i) => {
      const v = ai.get(i);
      if (!v) return;
      if (v.kind === "no") c.res = null;
      else if (v.kind === "variant") c.res = { match: "close", note: v.note ? "גרסה: " + v.note : "גרסה אחרת" };
      else c.res = withSize(query, c.p, { match: "exact", note: "" });
      c.done = true;
    });
  }
  for (const c of cands) if (!c.done) c.res = c.rule;

  const all = cands.filter((c) => c.res).map((c) => ({ ...c.p, ...c.res, store: c.r.store.name, store_id: c.r.store.id }));

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

  const statusOf = (r) => r.status !== "ok" ? r.status : all.some((o) => o.store_id === r.store.id && o.match !== "other") ? "ok" : "none";
  return {
    query,
    terms,
    matcher,
    matcher_note: matcher === "rules" && aiConfigured() ? (lastAiError || "skipped: stores were slow") : undefined,
    models: aiConfigured() ? usedModels() : undefined,
    checked_at: new Date().toISOString(),
    stores: perStore.map((r) => ({ id: r.store.id, name: r.store.name, status: statusOf(r), error: r.error, search_url: r.store.searchUrl(terms[0] || query) })),
    items: all.filter((o) => o.match !== "other"),
    other: all.filter((o) => o.match === "other").slice(0, 20),
  };
}
