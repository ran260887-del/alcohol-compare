// Diagnostics for a store that fails. Only fetches pages of the six stores (never an arbitrary site).
//   /api/debug?store=turki&q=בלוגה                      what the store returns for a search
//   /api/debug?store=turki&path=/search?q=x&find=price  fetch one page of that store and show where "find" appears
//   /api/debug?store=importer&q=בלוגה                   also runs the Google fallback and shows Google's answer
import { STORES, googleCreds } from "../lib/stores.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function peek(target, find) {
  try {
    const r = await fetch(target, { headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9", Accept: "*/*" }, signal: AbortSignal.timeout(8000) });
    const t = await r.text();
    const out = { url: target, status: r.status, type: r.headers.get("content-type"), server: r.headers.get("server"), length: t.length, start: t.slice(0, 600) };
    // addresses inside the page that look like search or data endpoints
    out.endpoints = [...new Set([...t.matchAll(/["'(](\/?(?:api|_next\/data|graphql|search|wp-json)[^"'\s)<>]{0,120})/g)].map((m) => m[1]))].slice(0, 40);
    out.next_build = (t.match(/"buildId":"([^"]+)"/) || [])[1] || null;
    if (find) {
      const re = new RegExp(find, "gi");
      out.found = [...t.matchAll(re)].slice(0, 8).map((m) => t.slice(Math.max(0, m.index - 250), m.index + 350));
    }
    return out;
  } catch (e) { return { url: target, error: String(e) }; }
}

export default async (req) => {
  const url = new URL(req.url);
  const s = STORES.find((x) => x.id === url.searchParams.get("store"));
  if (!s) return Response.json({ stores: STORES.map((x) => x.id) });
  const q = url.searchParams.get("q") || "בלוגה";
  const find = url.searchParams.get("find");
  const path = url.searchParams.get("path");
  const out = { store: s.name };

  if (path) {
    if (!path.startsWith("/")) return Response.json({ error: "path must start with /" }, { status: 400 });
    out.page = await peek(new URL(path, s.site).href, find);
    return Response.json(out);
  }

  if (!s.searchByQuery) out.search_page = await peek(s.searchUrl(q), find || q);
  try { out.parsed = (await (s.searchByQuery ? s.searchByQuery(q) : s.search(q))).slice(0, 5); } catch (e) { out.parsed_error = String(e.message || e); }
  if (s.fallback) {
    out.google_configured = Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX);
    // shape checks only; the key itself is never shown
    const { key, cx } = googleCreds();
    out.google_check = {
      cx,
      cx_looks_right: /^[a-z0-9]{10,30}$/i.test(cx),
      key_starts_with_AIza: key.startsWith("AIza"),
      key_length: key.length,
      key_length_ok: key.length === 39,
      raw_key_had_spaces: /\s/.test(process.env.GOOGLE_API_KEY || ""),
    };
    try { out.google = (await s.fallback([q])).slice(0, 5); } catch (e) { out.google_error = String(e.message || e); }
  }
  return Response.json(out);
};

export const config = { path: "/api/debug" };
