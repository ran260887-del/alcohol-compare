// Optional smart matching with Google Gemini (free tier from Google AI Studio).
// Set GEMINI_API_KEY in Netlify. Without it, or if Gemini fails, the rule-based matcher is used.

// Lightest and fastest first; if one is busy or missing, the next one is tried.
const MODELS = () => [process.env.GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean);

const PROMPT = (query, names) => `You match liquor products for an Israeli price-comparison site.
The shopper searched for: "${query}"
Below are product names from Israeli shops (Hebrew and/or English, any spelling). For EACH product decide:
- "same": the same drink the shopper means (same brand and same line/edition). Ignore bottle size, the word kosher, category words (וויסקי, וודקה, ליקר), and whether the parent brand is written (e.g. "בלאק לייבל" = "ג'וני ווקר בלאק לייבל", "רויאל סלוט" = "שיבאס ריגאל רויאל סלוט"). Spelling differences (ייגרמייסטר/יגרמייסטר/Jägermeister, סלוט/סאלוט) are the same.
- "variant": same brand, but a different edition, age, flavour, cask, or a gift set/pack with extras (e.g. Manifest, 18 vs 12 years, Gold Line, Double Cask, "+ 2 כוסות").
- "no": a different product or brand.
If the shopper gave an age (12, 18…), a different age is "variant". If the shopper gave no edition, the brand's standard bottle is "same" and special editions are "variant".
Reply with ONLY JSON: {"r":[[index,"same"|"variant"|"no","short Hebrew note for variants, else empty"], ...]} covering every index.

Products:
${names.map((n, i) => `${i}. ${n}`).join("\n")}`;

export function aiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || "").trim());
}

// Last reason Gemini was not used (Google's error text only; never the key).
export let lastAiError = "";

// Returns Map(index -> {kind, note}) or null when unavailable.
export async function aiClassify(query, names, { timeoutMs = 4000 } = {}) {
  lastAiError = "";
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key || !names.length) return null;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: PROMPT(query, names) }] }],
    // no "thinking" step: this is a quick sorting task and speed matters
    generationConfig: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
  });
  const deadline = Date.now() + timeoutMs;
  for (const model of MODELS()) {
    const left = deadline - Date.now();
    if (left < 800) break;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(left),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        lastAiError = "Gemini " + res.status + " (" + model + "): " + String(e?.error?.message || e?.error?.status || "error").replace(key, "***").slice(0, 140);
        if (res.status === 401 || res.status === 403) return null; // key problem: no point trying other models
        continue;                                                  // busy, missing or unsupported model: try the next one
      }
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const out = new Map();
      for (const row of parsed.r || []) {
        const [i, kind, note] = row;
        if (Number.isInteger(i) && ["same", "variant", "no"].includes(kind)) out.set(i, { kind, note: String(note || "").slice(0, 60) });
      }
      if (!out.size) lastAiError = "Gemini: empty answer";
      return out.size ? out : null;
    } catch (e) {
      lastAiError = "Gemini (" + model + "): " + (e?.name === "TimeoutError" ? "timeout" : "bad answer");
      if (e?.name === "TimeoutError") return null; // out of time
    }
  }
  if (!lastAiError) lastAiError = "Gemini: no time left";
  return null;
}
