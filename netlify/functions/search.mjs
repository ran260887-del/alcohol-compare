// GET /api/search?q=ייגרמייסטר ליטר&stores=bana,eliasi
import { comparePrices } from "../lib/compare.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (!q) return Response.json({ error: "חסר שם מוצר" }, { status: 400 });
  const stores = url.searchParams.get("stores");
  const data = await comparePrices(q, stores ? stores.split(",") : null);
  return Response.json(data, {
    headers: {
      // the same search is served from Netlify's cache for 30 minutes
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
      "Netlify-Vary": "query=q|stores",
    },
  });
};

export const config = { path: "/api/search" };
