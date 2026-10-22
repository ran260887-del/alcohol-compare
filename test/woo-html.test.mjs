// HTML fallback parser against card shapes seen in real WooCommerce themes.
import assert from "node:assert/strict";
import { parseWooHtml } from "../netlify/lib/stores.mjs";

const classic = `<ul class="products"><li class="product type-product post-1 instock">
<a href="https://shop/product/beluga-1l/"><h2 class="woocommerce-loop-product__title">וודקה בלוגה ליטר</h2>
<span class="price"><del><span class="woocommerce-Price-amount amount"><bdi>159.90&nbsp;<span class="woocommerce-Price-currencySymbol">&#8362;</span></bdi></span></del>
<ins><span class="woocommerce-Price-amount amount"><bdi>139.90&nbsp;<span class="woocommerce-Price-currencySymbol">&#8362;</span></bdi></span></ins></span></a></li>
<li class="product type-product post-2 outofstock"><a href="https://shop/product/beluga-700/"><h2 class="woocommerce-loop-product__title">וודקה בלוגה 700 מ"ל</h2>
<span class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#8362;</span>119.00</bdi></span></span></a></li></ul>`;
const elementor = `<div data-elementor-type="loop-item" class="elementor e-loop-item product type-product instock">
<h3 class="elementor-heading-title">16.5 ש"ח ל - 100 מ"ל</h3><a href="https://shop/product/noble/"><img alt="בקבוק וודקה בלוגה נובל ליטר"></a>
<h2 class="product_title entry-title elementor-heading-title">וודקה בלוגה נובל ליטר</h2><div class="price-line">165 ₪</div></div><footer>site</footer>`;

const a = parseWooHtml(classic, "https://shop");
assert.deepEqual(a.map((p) => [p.name, p.price, p.regular_price, p.size_ml, p.in_stock]),
  [["וודקה בלוגה ליטר", 139.9, 159.9, 1000, true], ['וודקה בלוגה 700 מ"ל', 119, 0, 700, false]]);
const b = parseWooHtml(elementor, "https://shop");
assert.deepEqual(b.map((p) => [p.name, p.price, p.url]), [["וודקה בלוגה נובל ליטר", 165, "https://shop/product/noble/"]]);
console.log("✓ WooCommerce HTML fallback");
