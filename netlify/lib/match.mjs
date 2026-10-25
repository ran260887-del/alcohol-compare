// Name normalization, size parsing and product matching (Hebrew + English).

const ENTITIES = { "&quot;": '"', "&#039;": "'", "&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#8217;": "'", "&#8211;": "-", "&#8221;": '"', "&#8243;": '"' };
export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
}

// Common brands: Hebrew spellings <-> English, so "jagermeister" finds "יגרמייסטר" and back.
export const BRANDS = [
  ["jagermeister", "יגרמייסטר", "ייגרמייסטר", "יגרמיסטר", "ייגר", "יגר"],
  ["absolut", "אבסולוט", "אבסולוטה"],
  ["smirnoff", "סמירנוף"],
  ["grey goose", "גריי גוס"],
  ["belvedere", "בלוודר"],
  ["beluga", "בלוגה"],
  ["finlandia", "פינלנדיה"],
  ["stoli", "סטולי", "סטוליצ'ניה", "stolichnaya"],
  ["ketel one", "קטל וואן"],
  ["johnnie walker", "גוני ווקר", "ג'וני ווקר", "גוני וולקר", "ג'וני וולקר"],
  ["black label", "בלאק לייבל", "בלאק"],
  ["red label", "רד לייבל"],
  ["jameson", "גיימסון", "ג'יימסון", "גמסון"],
  ["jack daniels", "גק דניאלס", "ג'ק דניאלס", "ג'ק דניאל'ס"],
  ["glenfiddich", "גלנפידיך"],
  ["glenlivet", "גלנליווט"],
  ["glenmorangie", "גלנמורנג'י", "גלנמורנגי"],
  ["macallan", "מקאלן", "מקלאן"],
  ["chivas", "שיבס", "שיבאס"],
  ["royal salute", "רויאל סלוט", "רויאל סאלוט"],
  ["dalmore", "דלמור"],
  ["balvenie", "בלוויני", "בלבני"],
  ["glendronach", "גלנדרונאך", "גלנדרונך"],
  ["jw", "ג'וני", "גוני"],
  ["ballantines", "בלנטיינס", "בלנטיינז"],
  ["monkey shoulder", "מאנקי שולדר", "מונקי שולדר"],
  ["laphroaig", "לפרויג"],
  ["lagavulin", "לגבולין"],
  ["talisker", "טליסקר"],
  ["bulleit", "בולייט", "בולט"],
  ["makers mark", "מייקרס מארק"],
  ["jim beam", "גים בים", "ג'ים בים"],
  ["bombay", "בומביי"],
  ["sapphire", "ספייר", "ספיר"],
  ["gordons", "גורדונס", "גורדון"],
  ["tanqueray", "טנקריי", "טנקרי"],
  ["hendricks", "הנדריקס"],
  ["beefeater", "ביפיטר"],
  ["monkey 47", "מאנקי 47"],
  ["bacardi", "בקרדי"],
  ["captain morgan", "קפטן מורגן"],
  ["havana club", "הוואנה קלאב", "הבאנה קלאב"],
  ["malibu", "מליבו"],
  ["jose cuervo", "חוסה קואורבו", "חוזה קוארבו"],
  ["patron", "פטרון"],
  ["don julio", "דון חוליו"],
  ["olmeca", "אולמקה"],
  ["baileys", "בייליס"],
  ["kahlua", "קלואה", "קאלואה"],
  ["cointreau", "קואנטרו"],
  ["campari", "קמפרי", "קמפארי"],
  ["aperol", "אפרול"],
  ["martini", "מרטיני"],
  ["hennessy", "הנסי"],
  ["remy martin", "רמי מרטין"],
  ["courvoisier", "קורבואזיה"],
  ["arak", "ערק"],
  ["ouzo", "אוזו"],
  ["sambuca", "סמבוקה"],
  ["limoncello", "לימונצ'לו", "לימונצלו"],
  ["manifest", "מניפסט"],
  ["orange", "אורנג'", "אורנג"],
  ["gold", "גולד"],
  ["vodka", "וודקה", "ודקה"],
  ["whisky", "וויסקי", "ויסקי", "whiskey"],
  ["gin", "גין", "ג'ין"],
  ["rum", "רום"],
  ["tequila", "טקילה"],
  ["liqueur", "ליקר"],
  ["cognac", "קוניאק"],
];

// Words that describe the category or packaging; they never decide whether two bottles are the same.
const GENERIC = new Set(["ליקר", "liqueur", "וודקה", "ודקה", "vodka", "וויסקי", "ויסקי", "whisky", "whiskey", "גין", "gin", "רום", "rum", "טקילה", "tequila",
  "קוניאק", "cognac", "ברנדי", "brandy", "כשר", "kosher", "בקבוק", "סקוטי", "סקוטש", "scotch", "single", "malt", "סינגל", "מאלט", "בלנדד", "blended",
  "ml", "מל", "ליטר", "l", "cl", "שנה", "שנים", "year", "years", "yo", "old", "אלכוהול", "משקה", "של", "עם", "ו", "the", "de", "of", "אירי", "irish",
  "נובל", "noble", "אוריגינל", "אורגינל", "original", "קלאסי", "קלאסיק", "classic", "בורבון", "bourbon", "אמריקאי", "liqueur", "herbal", "עשבים", "ליקר", "אפריטיף", "aperitif", "יין", "wine", "בירה"].map((w) => norm(w)));

export function norm(s) {
  return decodeEntities(s)
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")       // ä -> a
    .replace(/[֑-ׇ]/g, "")                          // Hebrew niqqud
    .replace(/[׳'`´’"״”“]/g, "")                              // geresh, quotes
    .replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ")
    .replace(/יי/g, "י").replace(/וו/g, "ו")                  // ייגר = יגר, וויסקי = ויסקי
    .replace(/[^a-z0-9א-ת.\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const ALIAS = new Map(); // normalized word -> group id
BRANDS.forEach((g, i) => g.forEach((w) => ALIAS.set(norm(w), i)));

// Returns size in ml, or null.
export function parseSize(s) {
  const t = decodeEntities(s).toLowerCase().replace(/,/g, ".");
  let m;
  if (/חצי\s*ליטר/.test(t)) return 500;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:מ\s*["״']?\s*ל|מ"ל|מל|ml|מיליליטר)(?![a-zא-ת])/))) return Math.round(+m[1]);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:cl|סל)(?![a-zא-ת])/))) return Math.round(+m[1] * 10);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:ליטר|ל['׳]|lt|ltr|l)(?![a-zא-ת])/))) return Math.round(+m[1] * 1000);
  if (/ליטר|\bliter\b|\blitre\b/.test(t)) return 1000;
  if ((m = t.match(BARE_SIZE))) return +m[1]; // "ליקר ייגרמייסטר 700"
  return null;
}

// Gift-set words: same bottle, different packaging.
const PACKAGING = new Set(["מארז", "כוס", "כוסות", "שוט", "שוטים", "מתנה", "אביזרים", "פטיש", "עור", "במארז", "קופסה", "gift", "box", "set", "glass", "glasses"].map((w) => norm(w)));

// Bottle sizes written without a unit.
const BARE_SIZE = /(?:^|\s)(200|330|350|375|500|700|750|1000|1500|1750)(?=\s|$)/;

function stripSize(s) {
  return s
    .replace(new RegExp(BARE_SIZE.source, "g"), " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:מ\s*["״'׳]{0,2}\s*ל|מ"ל|מל|ml|מיליליטר|cl|סל|ליטר|ל['׳]|lt|ltr|l)(?![a-zא-ת])/gi, " ")
    .replace(/חצי\s*ליטר|ליטר|liter|litre/gi, " ");
}

// Split a name into meaningful words (size removed, brand aliases unified).
export function words(s) {
  const n = norm(stripSize(decodeEntities(s)));
  const out = [];
  const toks = n.split(" ").filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    // two-word brands ("johnnie walker", "גוני ווקר")
    const two = toks[i] + " " + (toks[i + 1] || "");
    if (toks[i + 1] && ALIAS.has(two)) { const g = BRANDS[ALIAS.get(two)][0]; out.push(GENERIC.has(g) ? g : "#" + ALIAS.get(two)); i++; continue; }
    const w = toks[i];
    if (ALIAS.has(w)) { const g = BRANDS[ALIAS.get(w)][0]; out.push(GENERIC.has(g) ? g : "#" + ALIAS.get(w)); }
    else out.push(w);
  }
  return out;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Hebrew is written with or without the vowel letters א/ו/י ("סלוט" = "סאלוט"); compare without them.
const skeleton = (w) => w[0] + w.slice(1).replace(/[אוי]/g, "");

function wordHit(q, list) {
  if (list.includes(q)) return true;
  if (q.startsWith("#")) return false;
  for (const w of list) {
    if (w.startsWith("#")) continue;
    if (q.length >= 4 && w.length >= 3 && /[א-ת]/.test(q) && skeleton(q) === skeleton(w)) return true;
    if (q.length >= 4 && (w.startsWith(q) || q.startsWith(w) && w.length >= 4)) return true;
    if (q.length >= 5 && lev(q, w) <= (q.length >= 8 ? 2 : 1)) return true;
  }
  return false;
}

const isGeneric = (w) => GENERIC.has(w) || /^\d+%?$/.test(w) && false;

/**
 * Compare a product to the query.
 * Returns null (not this product), or {match: "exact"|"close", note}.
 */
export function compare(query, productName, productSizeMl) {
  const qWords = words(query).filter((w) => !GENERIC.has(w));
  if (!qWords.length) return null;
  const pWords = words(productName);
  const missing = qWords.filter((q) => !wordHit(q, pWords));
  // Allow one missing descriptive word ("בלוגה נובל" is sold as just "בלוגה"), never the brand or an age.
  const softMiss = missing.length === 1 && qWords.length >= 2 && !missing[0].startsWith("#") && !/^\d/.test(missing[0]) && qWords.some((q) => q.startsWith("#") || wordHit(q, pWords));
  if (missing.length && !softMiss) return null;

  const qSize = parseSize(query);
  const pSize = productSizeMl || parseSize(productName);

  // Extra significant words in the product = a different edition (Manifest, 18 year, Orange...).
  // In a gift set, words after "+" or after "כוסות/במארז" describe the accessories, not the bottle.
  const isPackWord = (w) => PACKAGING.has(w) || /^(ו|ב|עמ|כ)?(כוס|כוסות|מארז|אביזר|אביזרימ|מתנה|פטיש|עור|קופסה|קופסת)$/.test(w);
  let core = words(String(productName).split("+")[0]);
  const cut = core.findIndex((w, i) => i > 0 && isPackWord(w));
  if (cut > 0) core = core.slice(0, cut + 1);
  const extras = core.filter((w) => !GENERIC.has(w) && !wordHit(w, qWords) && !qWords.some((q) => wordHit(q, [w])));
  const extraNums = extras.filter((w) => /^\d+$/.test(w));
  const isPack = isPackWord;
  const extraWords = extras.filter((w) => !/^\d+(\.\d+)?$/.test(w) && w.length > 1 && !isPack(w));
  const packed = pWords.some(isPack) || /מארז|gift|\+/.test(norm(productName) + productName);

  // in a gift set, "+ 2 כוסות" is a count of glasses, not an age
  const realNums = packed ? extraNums.filter((x) => +x > 6) : extraNums;
  const qNums = qWords.filter((w) => /^\d+$/.test(w));
  // A different age than the one asked for (asked 12, found 18) is another product.
  if (realNums.length && qNums.length) return { match: "other", note: "גרסה אחרת (" + realNums.join(", ") + ")" };
  // Otherwise extra details are a variant of what was asked: show it, labelled.
  const label = [...realNums.map((n) => n + " שנה"), ...extraWords.map((w) => (w.startsWith("#") ? (BRANDS[+w.slice(1)][1] || BRANDS[+w.slice(1)][0]) : w))].join(" ");
  if (label) return { match: "close", note: "גרסה: " + label };
  if (packed) return { match: "close", note: "מארז" };
  if (qSize && pSize && qSize !== pSize) return { match: "close", note: "גודל אחר" };
  if (qSize && !pSize) return { match: "close", note: "גודל לא צוין" };
  if (softMiss) return { match: "close", note: "ייתכן שזה אותו מוצר (בלי \"" + missing[0] + "\" בשם)" };
  return { match: "exact", note: "" };
}

// Search terms to send to store search boxes, which match text literally.
export function searchTerms(query) {
  const raw = decodeEntities(stripSize(query)).replace(/\s+/g, " ").trim();
  const terms = new Set();
  if (raw) terms.add(raw);
  const qWords = words(query).filter((w) => !GENERIC.has(w));
  const main = qWords.find((w) => w.startsWith("#"));
  if (main) {
    // brand: every known spelling, Hebrew first
    const g = BRANDS[+main.slice(1)];
    g.filter((w) => /[א-ת]/.test(w)).slice(0, 2).forEach((w) => terms.add(w));
    terms.add(g[0]);
  }
  const collapsed = raw.replace(/יי/g, "י").replace(/וו/g, "ו").replace(/['׳"״]/g, "");
  if (collapsed) terms.add(collapsed);
  // single words catch other spellings of the rest ("רויאל" finds "רויאל סאלוט")
  const plain = raw.split(/\s+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !GENERIC.has(norm(w)));
  if (plain.length > 1) plain.sort((a, b) => b.length - a.length).forEach((w) => terms.add(w));
  return [...terms].slice(0, 4);
}
