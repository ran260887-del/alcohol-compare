// Try a search from your own computer without Netlify:  npm run try -- "ייגרמייסטר ליטר"
import { comparePrices } from "../netlify/lib/compare.mjs";

const q = process.argv.slice(2).join(" ") || "ייגרמייסטר ליטר";
const r = await comparePrices(q);
console.log("חיפוש:", q, "| מילות חיפוש:", r.terms.join(" / "));
for (const s of r.stores) console.log(`  ${s.name.padEnd(14)} ${s.status}${s.error ? " (" + s.error + ")" : ""}`);
console.log();
for (const i of r.items) console.log(`  ₪${String(i.price).padEnd(8)} ${i.store.padEnd(14)} ${i.match.padEnd(6)} ${i.name}${i.note ? "  [" + i.note + "]" : ""}`);
if (r.other.length) { console.log("\nגרסאות אחרות:"); for (const i of r.other) console.log(`  ₪${i.price}  ${i.store}  ${i.name}`); }
