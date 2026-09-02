cat > src/lib/robopilot/live-pricing.ts << 'FILE_EOF_1'
/**
 * Best-effort LIVE price lookup against real storefronts.
 *
 * IMPORTANT — this is an ENHANCEMENT layer only:
 * - tools.ts / estimate_bom() remains the deterministic, network-free floor.
 *   It is untouched by this file and keeps working exactly as before.
 * - This module is called *after* estimate_bom() (see service.ts) to try to
 *   overlay a real current price. If every store fails, times out, or
 *   returns nothing parseable, the caller keeps the catalog price (or
 *   `not_in_catalog`) it already had — never a guess.
 * - No AI model is ever the source of a price here. Prices come only from
 *   parsing real HTTP responses from the named storefronts at request time.
 *
 * Known limitations (documented honestly, not hidden):
 * - Extraction is pattern-based (regex over raw HTML near a product link),
 *   not exact per-theme CSS selectors — this trades precision for
 *   resilience against markup changes, but can occasionally miss or grab
 *   the wrong price. Treat every result as "best effort", not certified.
 * - Electra Store's exact search URL was not confirmed against a live
 *   results page at the time this was written (only a product page was
 *   inspected) — verify `buildSearchUrl` below still works if prices stop
 *   resolving from that store.
 * - EGP→USD conversion uses a live exchange-rate API with a hardcoded
 *   fallback rate if that call also fails; the fallback rate will drift out
 *   of date over time and should be refreshed periodically.
 */

import { extractWithDeepSeek } from "./deepseek-extractor";

export type PriceRegion = "egypt" | "international";

export interface LivePriceResult {
  productName: string;
  priceLocal: number;
  currencyLocal: "EGP" | "USD";
  priceUsd: number;
  storeName: string;
  listingUrl: string;
}

interface StoreAdapter {
  name: string;
  currency: "EGP" | "USD";
  buildSearchUrl(query: string): string;
}

const EGYPT_STORES: StoreAdapter[] = [
  {
    name: "Electra Store",
    currency: "EGP",
    // Unverified pattern — see "Known limitations" above.
    buildSearchUrl: (q) => `https://electra.store/products?search=${encodeURIComponent(q)}`,
  },
  {
    name: "Makers Electronics",
    currency: "EGP",
    buildSearchUrl: (q) =>
      `https://makerselectronics.com/?s=${encodeURIComponent(q)}&post_type=product&type_aws=true`,
  },
  {
    name: "Future Electronics Egypt",
    currency: "EGP",
    buildSearchUrl: (q) => `https://store.fut-electronics.com/search?q=${encodeURIComponent(q)}&type=product`,
  },
];

const INTERNATIONAL_STORES: StoreAdapter[] = [
  {
    name: "SparkFun",
    currency: "USD",
    buildSearchUrl: (q) => `https://www.sparkfun.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
];

const FETCH_TIMEOUT_MS = 6000;
const MAX_CANDIDATE_SNIPPETS = 6;
const SNIPPET_WINDOW_CHARS = 500;

/**
 * True if the anchor's attribute string looks like a genuine product
 * LISTING link — not a category/tag/navigation link that merely CONTAINS
 * the substring "product". Confirmed by directly inspecting a real Makers
 * Electronics page: links like "/product-category/robotics/" and
 * "/product-tag/esp32/" matched a looser "product" check and were the
 * actual reason candidate snippets kept containing category-menu links
 * instead of real listings, so DeepSeek correctly (but uselessly) reported
 * found:false every time. Matches WooCommerce's /product/{slug}/,
 * Shopify's /products/{slug}, and Magento's product-item-link class.
 */
function isProductLink(attrs: string): boolean {
  return /\/product\/|\/products\/|product-item-link/i.test(attrs);
}

/**
 * Locates likely product-listing anchors (same heuristic as extractBestMatch)
 * and returns a handful of SHORT text windows around each one, instead of
 * the full page. Two benefits: (1) token cost to DeepSeek drops roughly
 * 5-10x since we're not paying for nav menus/headers/footers, and (2)
 * accuracy improves because the model is looking at focused, likely-relevant
 * regions instead of getting lost in a large page. Returns "" (no DeepSeek
 * call made) when the page has no product-like anchors at all — saves a
 * wasted API call outright.
 */
export function buildCandidateSnippets(html: string): string {
  const anchorRegex = /<a\s+([^>]*)>(.*?)<\/a>/gis;
  const snippets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && snippets.length < MAX_CANDIDATE_SNIPPETS) {
    const attrs = match[1];
    if (!attrs || !isProductLink(attrs)) continue;

    const windowEnd = Math.min(html.length, anchorRegex.lastIndex + SNIPPET_WINDOW_CHARS);
    const snippet = html
      .slice(match.index, windowEnd)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
    snippets.push(snippet);
  }

  return snippets.join("\n---\n");
}

// Approximate, hand-set fallback rate — used ONLY when the live exchange-rate
// API also fails. Expect this to drift out of date; refresh periodically.
// Never sourced from an AI model's memory — see module-level docs above for
// why that specific approach is deliberately avoided in this project.
export const EGP_TO_USD_FALLBACK_RATE = 0.021; // ≈ 47.6 EGP per USD

let cachedEgpToUsd: { rate: number; fetchedAt: number } | null = null;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoboPilotBot/1.0; educational project, non-commercial)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getEgpToUsdRate(): Promise<number> {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (cachedEgpToUsd && Date.now() - cachedEgpToUsd.fetchedAt < ONE_HOUR_MS) {
    return cachedEgpToUsd.rate;
  }
  try {
    const res = await fetchWithTimeout("https://api.frankfurter.dev/v1/latest?base=EGP&symbols=USD", FETCH_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.USD;
      if (typeof rate === "number" && rate > 0) {
        cachedEgpToUsd = { rate, fetchedAt: Date.now() };
        return rate;
      }
    }
  } catch {
    // fall through to fallback rate below
  }
  return EGP_TO_USD_FALLBACK_RATE;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Converts a known (catalog) USD price to an approximate EGP figure using
 * the fallback rate above. This is only ever applied to a price that
 * already came from a real source (the approved catalog) — it is a unit
 * conversion, not a price estimate invented from scratch, and it is never
 * derived from an AI model's memory.
 */
export function usdToApproxEgp(usd: number): number {
  return round2(usd / EGP_TO_USD_FALLBACK_RATE);
}

/**
 * Pattern-based extraction: finds the first anchor tag whose href looks
 * like a product link, then looks for a nearby price token in the raw HTML
 * that follows it. Deliberately theme-agnostic — see module-level caveats.
 */
export function extractBestMatch(
  html: string,
  baseUrl: string,
  currency: "EGP" | "USD"
): { name: string; price: number; url: string } | null {
  // Capture the anchor's attribute string separately from its inner text, so
  // we can recognize "this is a product link" from EITHER the href (e.g.
  // Egyptian stores use /product/... or /products/...) OR a class name like
  // "product-item-link" (Magento/SparkFun product links don't put "product"
  // in the URL slug itself, e.g. /arduino-nano-every.html).
  const anchorRegex = /<a\s+([^>]*)>(.*?)<\/a>/gis;
  const hrefRegex = /href="([^"]+)"/i;
  const priceRegex =
    currency === "EGP"
      ? /(?:EGP|LE)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:EGP|LE)\b/i
      : /\$\s?([\d,]+(?:\.\d{1,2})?)/;

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const rawInner = match[2];
    if (!attrs || !rawInner) continue;
    if (!isProductLink(attrs)) continue;

    const hrefMatch = hrefRegex.exec(attrs);
    const href = hrefMatch?.[1];
    if (!href) continue;

    const inner = rawInner
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!inner || inner.length < 3) continue;

    const windowEnd = Math.min(html.length, anchorRegex.lastIndex + 400);
    const windowText = html.slice(anchorRegex.lastIndex, windowEnd);
    const priceMatch = priceRegex.exec(windowText);
    if (!priceMatch) continue;

    const rawPrice = (priceMatch[1] ?? priceMatch[2] ?? "").replace(/,/g, "");
    const price = parseFloat(rawPrice);
    if (!Number.isFinite(price) || price <= 0) continue;

    const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    return { name: inner, price, url };
  }
  return null;
}

async function searchStore(query: string, store: StoreAdapter): Promise<LivePriceResult | null> {
  try {
    const url = store.buildSearchUrl(query);
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      console.warn(`[live-pricing] ${store.name} HTTP ${res.status} for "${query}"`);
      return null;
    }
    const html = await res.text();

    // Primary: let DeepSeek read a handful of SHORT, targeted snippets
    // (not the whole page — see buildCandidateSnippets) and extract the
    // listing. Skipped entirely if there's nothing product-like on the
    // page at all, saving a wasted API call. Falls back to the regex
    // extractor (on the full page) if no DEEPSEEK_API_KEY is set or the
    // call fails.
    const candidateSnippets = buildCandidateSnippets(html);
    const aiResult = candidateSnippets ? await extractWithDeepSeek(candidateSnippets, query, store.currency) : null;
    const found = aiResult
      ? { name: aiResult.productName, price: aiResult.price, url: aiResult.url ?? url }
      : extractBestMatch(html, url, store.currency);

    if (!found) {
      console.warn(`[live-pricing] ${store.name} returned no extractable price for "${query}"`);
      return null;
    }

    const priceUsd = store.currency === "USD" ? found.price : round2(found.price * (await getEgpToUsdRate()));
    const listingUrl = found.url.startsWith("http") ? found.url : new URL(found.url, url).toString();

    console.warn(
      `[live-pricing] ${store.name} matched "${query}" -> "${found.name}" @ ${found.price} ${store.currency} ($${priceUsd}) [${aiResult ? "deepseek" : "regex"}]`
    );

    return {
      productName: found.name,
      priceLocal: found.price,
      currencyLocal: store.currency,
      priceUsd,
      storeName: store.name,
      listingUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[live-pricing] ${store.name} request failed for "${query}": ${message}`);
    return null;
  }
}

/**
 * Tries every store for the region in parallel; returns the cheapest
 * successful match, or null if every store failed/timed out/returned
 * nothing parseable. Callers MUST treat null as "keep the existing catalog
 * price" — never as "price is zero".
 */
export async function fetchLivePrice(componentName: string, region: PriceRegion): Promise<LivePriceResult | null> {
  const stores = region === "egypt" ? EGYPT_STORES : INTERNATIONAL_STORES;
  const settled = await Promise.allSettled(stores.map((s) => searchStore(componentName, s)));

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<LivePriceResult | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is LivePriceResult => v !== null);

  if (successful.length === 0) return null;
  const sorted = [...successful].sort((a, b) => a.priceUsd - b.priceUsd);
  return sorted[0] ?? null;
}
FILE_EOF_1

cat > tests/unit/live-pricing.test.ts << 'FILE_EOF_2'
import { describe, expect, it } from "vitest";
import {
  buildCandidateSnippets,
  extractBestMatch,
  usdToApproxEgp,
  EGP_TO_USD_FALLBACK_RATE,
} from "@/lib/robopilot/live-pricing";

// Fixtures deliberately mirror the real markup shapes seen when the three
// Egyptian stores and SparkFun were inspected while building this feature —
// not exact copies of their HTML, just the same structural pattern (a
// product link followed shortly by a price token).

describe("extractBestMatch", () => {
  it("extracts an EGP price from WooCommerce-style markup (Makers Electronics)", () => {
    const html = `
      <li class="product">
        <a href="https://makerselectronics.com/product/arduino-nano-ch340/">
          <h2>Arduino Nano CH340</h2>
        </a>
        <span class="price">230.00 EGP</span>
      </li>
    `;
    const result = extractBestMatch(html, "https://makerselectronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(230);
    expect(result!.name.toLowerCase()).toContain("arduino nano");
    expect(result!.url).toBe("https://makerselectronics.com/product/arduino-nano-ch340/");
  });

  it("extracts an EGP price shown as a leading 'LE' token (Shopify-style)", () => {
    const html = `
      <div class="grid-product">
        <a href="/products/mg996r-servo-motor">
          <span class="grid-product__title">MG996R High Torque Servo Motor</span>
        </a>
        <span class="price">LE 180.00</span>
      </div>
    `;
    const result = extractBestMatch(html, "https://store.fut-electronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(180);
    // relative href should be resolved against baseUrl
    expect(result!.url).toBe("https://store.fut-electronics.com/products/mg996r-servo-motor");
  });

  it("extracts a USD price from Magento-style markup (SparkFun)", () => {
    const html = `
      <li class="product-item">
        <a class="product-item-link" href="https://www.sparkfun.com/arduino-nano-every.html">
          Arduino Nano Every
        </a>
        <span class="price">$20.00</span>
      </li>
    `;
    const result = extractBestMatch(html, "https://www.sparkfun.com/", "USD");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(20);
  });

  it("handles thousands separators in the price", () => {
    const html = `<a href="/products/nvidia-jetson">Jetson Orin Nano</a> 35,000.00 EGP`;
    const result = extractBestMatch(html, "https://makerselectronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(35000);
  });

  it("returns null when no product link is present", () => {
    const html = `<a href="/about-us">About Us</a><span>230.00 EGP</span>`;
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });

  it("returns null when a product link has no nearby price", () => {
    const html = `<a href="/products/arduino-nano">Arduino Nano</a><p>Currently unavailable.</p>`;
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });

  it("never matches a currency from the wrong region (USD pattern on an EGP page)", () => {
    const html = `<a href="/products/some-part">Some Part</a> $20.00`;
    // Asking for EGP but the page only has a $ price — should not match.
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });

  // --- Same real bug as buildCandidateSnippets below: a loose "product" ---
  // --- substring check was matching WooCommerce category/tag nav links. ---
  it("does not mistake a '/product-category/' navigation link for a real listing", () => {
    const html = `<a href="https://makerselectronics.com/product-category/robotics">Robotics</a> 400.00 EGP`;
    expect(extractBestMatch(html, "https://makerselectronics.com/", "EGP")).toBeNull();
  });
});

// --- usdToApproxEgp: a plain, deterministic unit conversion of an already- ---
// --- known catalog price — never a price recalled from an AI model.       ---
describe("usdToApproxEgp", () => {
  it("converts a known USD price using the documented fallback rate", () => {
    const usd = 10;
    const expected = Math.round((usd / EGP_TO_USD_FALLBACK_RATE) * 100) / 100;
    expect(usdToApproxEgp(usd)).toBe(expected);
  });

  it("is deterministic: same input always produces the same output", () => {
    expect(usdToApproxEgp(9.5)).toBe(usdToApproxEgp(9.5));
  });

  it("scales linearly with the input price", () => {
    expect(usdToApproxEgp(20)).toBeCloseTo(usdToApproxEgp(10) * 2, 0);
  });
});

// --- buildCandidateSnippets: the fix for real testing showing a large nav ---
// --- menu (hundreds of category links) drowning out the actual product   ---
// --- listings once HTML was simply truncated at a fixed length.          ---
describe("buildCandidateSnippets", () => {
  it("returns an empty string (skip the AI call) when there are no product-like anchors", () => {
    const html = `<nav>${"<a href='/category/x'>Category</a>".repeat(50)}</nav>`;
    expect(buildCandidateSnippets(html)).toBe("");
  });

  it("extracts short windows around product anchors even behind a huge unrelated nav menu", () => {
    const hugeNav = "<a href='/category/x'>Category</a>".repeat(2000); // far past any fixed-length truncation
    const html = `<nav>${hugeNav}</nav><div><a href="/product/esp32-devkit">ESP32 DevKit</a> 452.38 EGP</div>`;
    const snippets = buildCandidateSnippets(html);
    expect(snippets).not.toBe("");
    expect(snippets).toContain("ESP32 DevKit");
    // The whole nav menu must NOT have been forwarded — snippets stay short.
    expect(snippets.length).toBeLessThan(5000);
  });

  it("caps the number of candidate snippets instead of forwarding every match", () => {
    const manyProducts = Array.from(
      { length: 20 },
      (_, i) => `<a href="/product/item-${i}">Item ${i}</a> ${i + 1}.00 EGP`
    ).join(" ");
    const snippets = buildCandidateSnippets(manyProducts);
    const separatorCount = (snippets.match(/---/g) ?? []).length;
    expect(separatorCount).toBeLessThanOrEqual(5); // MAX_CANDIDATE_SNIPPETS - 1 separators
  });

  it("strips scripts and styles out of each snippet", () => {
    const html = `<a href="/product/x">X</a><script>trackClick()</script><style>.x{color:red}</style> 10.00 EGP`;
    const snippets = buildCandidateSnippets(html);
    expect(snippets).not.toContain("trackClick");
    expect(snippets).not.toContain("color:red");
  });

  // --- Real bug found by directly inspecting a live Makers Electronics    ---
  // --- product page: hundreds of "/product-category/..." and             ---
  // --- "/product-tag/..." navigation links all matched a loose "product" ---
  // --- substring check, so every candidate snippet sent to DeepSeek was  ---
  // --- category-menu noise instead of an actual listing — DeepSeek's     ---
  // --- found:false responses were correct given what it was shown.       ---
  it("does NOT treat WooCommerce category/tag navigation links as product listings", () => {
    const html = [
      '<a href="https://makerselectronics.com/product-category/robotics">Robotics</a>',
      '<a href="https://makerselectronics.com/product-category/sensors">Sensors</a>',
      '<a href="https://makerselectronics.com/product-tag/esp32">esp32</a>',
    ].join("");
    expect(buildCandidateSnippets(html)).toBe("");
  });

  it("still correctly matches a real WooCommerce product link alongside category noise", () => {
    const html = [
      '<a href="https://makerselectronics.com/product-category/robotics">Robotics</a>',
      '<a href="https://makerselectronics.com/product/esp32-development-board-38-pin">ESP32 Development Board</a> 400.00 EGP',
    ].join("");
    const snippets = buildCandidateSnippets(html);
    expect(snippets).toContain("ESP32 Development Board");
  });
});
FILE_EOF_2

echo "Done. Run: npm run typecheck && npm test (expect 60 passed)"
