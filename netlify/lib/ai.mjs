// Optional smart matching with Google Gemini (free tier from Google AI Studio).
// Set GEMINI_API_KEY in Netlify. Without it, or if Gemini fails, the rule-based matcher is used.

// Which Gemini models this key may use changes over time, so ask Google once and keep the answer.
let modelCache = null, modelCachedAt = 0;
const versionOf = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
async function pickModels(key, signal) {
  if (modelCache && Date.now() - modelCachedAt < 6 * 3600e3) return modelCache;
  const fallback = [process.env.GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean);
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal });
    if (!res.ok) return fallback;
    const list = ((await res.json()).models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !/image|tts|audio|live|embed|vision|thinking|exp/.test(n));
    // fastest first: flash-lite before flash, newest version first, stable before preview
    const score = (n) => (/lite/.test(n) ? 0 : 1) * 1000 - versionOf(n) * 10 + (/preview/.test(n) ? 1 : 0);
    const picked = [...new Set([process.env.GEMINI_MODEL, ...list.sort((a, b) => score(a) - score(b))].filter(Boolean))].slice(0, 4);
    if (picked.length) { modelCache = picked; modelCachedAt = Date.now(); return picked; }
  } catch {}
  return fallback;
}

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
export const usedModels = () => modelCache || [];

// Returns Map(index -> {kind, note}) or null when unavailable.
export async function aiClassify(query, names, { timeoutMs = 4000 } = {}) {
  lastAiError = "";
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key || !names.length) return null;
  const deadline = Date.now() + timeoutMs;
  const models = await pickModels(key, AbortSignal.timeout(Math.min(1500, timeoutMs / 3)));
  const bodyFor = (model, fast) => JSON.stringify({
    contents: [{ role: "user", parts: [{ text: PROMPT(query, names) }] }],
    // as little "thinking" as the model allows: this is a quick sorting task and speed matters
    generationConfig: { temperature: 0, responseMimeType: "application/json",
      ...(fast ? { thinkingConfig: /gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" } } : {}) },
  });
  for (const model of models) for (const fast of [true, false]) {
    const left = deadline - Date.now();
    if (left < 800) break;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: bodyFor(model, fast),
        signal: AbortSignal.timeout(left),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        lastAiError = "Gemini " + res.status + " (" + model + "): " + String(e?.error?.message || e?.error?.status || "error").replace(key, "***").slice(0, 140);
        if (res.status === 401 || res.status === 403) return null; // key problem: no point trying other models
        if (res.status === 400 && fast) continue;                  // this model rejects the speed setting: same model without it
        break;                                                     // busy or missing model: next model
      }
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const out = new Map();
      for (const row of parsed.r || []) {
        const [i, kind, note] = row;
        if (Number.isInteger(i) && ["same", "variant", "no"].includes(kind)) out.set(i, { kind, note: String(note || "").slice(0, 60) });
      }
      if (out.size) return out;
      lastAiError = "Gemini (" + model + "): empty answer";
      break;
    } catch (e) {
      lastAiError = "Gemini (" + model + "): " + (e?.name === "TimeoutError" ? "timeout" : "bad answer");
      if (e?.name === "TimeoutError") return null; // out of time
      break;
    }
  }
  if (!lastAiError) lastAiError = "Gemini: no time left";
  return null;
}
