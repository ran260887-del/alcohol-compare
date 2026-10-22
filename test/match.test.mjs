import { compare, parseSize, searchTerms, norm } from "../netlify/lib/match.mjs";
import assert from "node:assert/strict";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("✓", name); };
const m = (q, p, size) => compare(q, p, size)?.match ?? null;

t("sizes", () => {
  assert.equal(parseSize("ליקר ייגרמייסטר ליטר"), 1000);
  assert.equal(parseSize('ייגרמייסטר ליקר 700 מ"ל'), 700);
  assert.equal(parseSize("ליקר ייגרמייסטר 700 מ&quot;ל"), 700);
  assert.equal(parseSize("יגרמייסטר 500 מ״ל"), 500);
  assert.equal(parseSize("ייגרמייסטר 200 מל'"), 200);
  assert.equal(parseSize("Jagermeister 1L"), 1000);
  assert.equal(parseSize("Jägermeister 70cl"), 700);
  assert.equal(parseSize("גלנפידיך 12"), null);
  assert.equal(parseSize("וודקה 1.75 ליטר"), 1750);
});

t("spelling variants match", () => {
  assert.equal(norm("ייגרמייסטר"), norm("יגרמייסטר").replace(/^י/, "י"));
  for (const p of ["ליקר ייגרמייסטר ליטר", "יגרמייסטר ליטר", "ייגרמייסטר ליטר", "יגרמייסטר ליטר כשר Jagermeister", "ליקר יגרמייסטר ליטר", "Jagermeister 1L"])
    assert.equal(m("ייגרמייסטר ליטר", p), "exact", p);
  assert.equal(m("jagermeister 1l", "ליקר ייגרמייסטר ליטר"), "exact");
  assert.equal(m("יגרמיסטר ליטר", "ליקר ייגרמייסטר ליטר"), "exact");
});

t("other sizes are partial, other editions are separate", () => {
  assert.equal(m("ייגרמייסטר ליטר", 'ייגרמייסטר ליקר 700 מ"ל'), "close");
  assert.equal(m("ייגרמייסטר ליטר", 'ייגרמייסטר מניפסט ליקר 500 מ"ל'), "other");
  assert.equal(m("ייגרמייסטר", "יגרמייסטר 700 מ״ל"), "exact");
  assert.equal(m("ייגרמייסטר ליטר", "וודקה אבסולוט ליטר"), null);
});

t("whisky ages", () => {
  assert.equal(m("גלנפידיך 12", "וויסקי גלנפידיך 12 שנה 700 מל"), "exact");
  assert.equal(m("גלנפידיך 12", "וויסקי גלנפידיך 18 שנה 700 מל"), null);
  assert.equal(m("גלנפידיך", "וויסקי גלנפידיך 18 שנה 700 מל"), "other");
  assert.equal(m("glenfiddich 12", "גלנפידיך 12 שנים"), "exact");
});

t("brand names in two words", () => {
  assert.equal(m("ג'וני ווקר בלאק", "וויסקי ג'וני ווקר בלאק לייבל 700 מ\"ל"), "exact");
  assert.equal(m("גוני ווקר בלאק", "Johnnie Walker Black Label 1L"), "exact");
  assert.equal(m("בומביי ספייר ליטר", "ג'ין בומביי ספיר ליטר"), "exact");
});

t("search terms", () => {
  const s = searchTerms("ייגרמייסטר ליטר");
  assert.ok(s.includes("ייגרמייסטר") && s.includes("jagermeister"), s.join());
  console.log("   terms:", s.join(" | "), "||", searchTerms("גלנפידיך 12").join(" | "));
});

console.log(n + " groups passed");

t("gift sets and editions", () => {
  assert.equal(m("בלוגה ליטר", "וודקה בלוגה ליטר"), "exact");
  assert.equal(m("בלוגה ליטר", "מארז וודקה בלוגה סלבריישן ליטר + כוס"), "other");
  assert.equal(m("בלוגה ליטר", "וודקה בלוגה גולד ליין במארז עור ופטיש"), "other");
  assert.equal(m("בלוגה ליטר", "מארז וודקה בלוגה ליטר + 2 כוסות"), "close");
  assert.equal(m("בלוגה ליטר", "וודקה בלוגה 1.75 ליטר"), "close");
  assert.equal(m("ייגרמייסטר", 'מארז ייגרמייסטר 700 מ"ל + 2 כוסות שוט ירוקות'), "close");
});

t("one missing descriptive word", () => {
  assert.equal(m("בלוגה נובל ליטר", "וודקה בלוגה נובל ליטר"), "exact");
  assert.equal(m("גלנפידיך 12 אמריקן", "וויסקי גלנפידיך 12 שנה"), "close");
  assert.equal(m("בלוגה נובל", "וודקה בלוגה גולד ליין"), "other");
  assert.equal(m("גלנפידיך 12", "וויסקי גלנפידיך"), null);
  assert.equal(m("ייגרמייסטר ליטר", "וודקה אבסולוט ליטר"), null);
});

t("standard-edition words", () => {
  assert.equal(m("בלוגה ליטר", "בלוגה נובל ליטר"), "exact");
  assert.equal(m("בלוגה נובל ליטר", "וודקה בלוגה ליטר"), "exact");
});
