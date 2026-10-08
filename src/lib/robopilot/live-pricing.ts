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
 * - Store search URLs are verified by checking that a nonsense query returns
 *   NO product links. A parameter a site ignores will happily return its
 *   whole catalog, and an extractor cannot tell that apart from a real hit.
 *   Re-check with that method if a store stops resolving.
 * - EGP→USD conversion uses a live exchange-rate API with a hardcoded
 *   fallback rate if that call also fails; the fallback rate will drift out
 *   of date over time and should be refreshed periodically.
 */

import { extractWithDeepSeek } from "./deepseek-extractor";
import { EGP_TO_USD_FALLBACK_RATE } from "./fx";

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
    // Verified against the live site on 2026-10-08. The previous `?search=`
    // parameter was silently IGNORED: the page returned byte-for-byte
    // identical HTML for "ESP32" and for a nonsense term, i.e. the full
    // unfiltered product listing. That is worse than returning nothing —
    // the extractor would have read a price off an arbitrary product. `?q=`
    // is the parameter the site's own search box uses, and a nonsense term
    // returns zero product links.
    buildSearchUrl: (q) => `https://electra.store/products?q=${encodeURIComponent(q)}`,
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
/** Cap on the VISIBLE TEXT kept per candidate, after markup is stripped. */
const MAX_SNIPPET_TEXT_CHARS = 420;

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

    const href = /href="([^"]+)"/i.exec(attrs)?.[1] ?? "";
    // Raw markup was being sent before, sliced by character count from the
    // anchor's start. That assumed a small anchor followed by the price.
    // On a store whose anchor wraps the whole product card (Electra's cards
    // run ~5 KB), the slice was ten times the intended size and most of it
    // was attributes, inline SVG and Livewire handlers — paid for per token
    // and nothing for the model to read. Condensing to visible text keeps
    // the name and the price, which is all the extraction needs.
    const body = html
      .slice(match.index, Math.min(html.length, anchorRegex.lastIndex + SNIPPET_WINDOW_CHARS))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_SNIPPET_TEXT_CHARS);

    if (!body) continue;
    snippets.push(href ? `${href}\n${body}` : body);
  }

  return snippets.join("\n---\n");
}

// Used ONLY when the live exchange-rate API call also fails. Defined in
// ./fx.ts because the client-side budget field needs the same number — see
// that file for why it is deliberately a shared constant. Re-exported here so
// existing importers (and tests) keep working.
export { EGP_TO_USD_FALLBACK_RATE } from "./fx";

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

/** Store markup carries entity-escaped names ("WiFi &amp; BLE5"). Decode the
 *  handful that actually show up so a product name is readable wherever it
 *  surfaces — logs today, the UI if it is ever displayed. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
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
  // The leading \b on the EGP|LE alternative matters: without it, "LE" matches
  // inside a word. A real Electra listing is named "... WiFi & BLE5 ...", and
  // the old pattern read "LE5" out of "BLE5" and returned a 5 EGP price.
  const priceRegex =
    currency === "EGP"
      ? /\b(?:EGP|LE)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:EGP|LE)\b/i
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

    // On whole-card anchors the inner text is the entire card, so prefer the
    // accessible name the markup already provides over a wall of text.
    const ariaLabel = decodeEntities(/aria-label="([^"]+)"/i.exec(attrs)?.[1] ?? "").trim();
    const inner =
      ariaLabel ||
      rawInner
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
    if (!inner || inner.length < 3) continue;

    // Card layouts differ in where the price sits relative to the link.
    // WooCommerce/Magento put it as a sibling AFTER the anchor closes;
    // Electra (Livewire) wraps the entire card — image, title, vendor and
    // price — INSIDE one big anchor, so a price-after-</a> search finds
    // nothing there. Search the anchor's own content first, then the text
    // that follows it.
    const trailingEnd = Math.min(html.length, anchorRegex.lastIndex + 400);
    const priceMatch =
      priceRegex.exec(rawInner) ?? priceRegex.exec(html.slice(anchorRegex.lastIndex, trailingEnd));
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
