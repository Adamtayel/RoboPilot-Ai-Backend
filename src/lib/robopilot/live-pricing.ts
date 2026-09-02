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
    if (!/product/i.test(attrs)) continue;

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
    const found = extractBestMatch(html, url, store.currency);
    if (!found) {
      console.warn(`[live-pricing] ${store.name} returned no extractable price for "${query}"`);
      return null;
    }

    const priceUsd = store.currency === "USD" ? found.price : round2(found.price * (await getEgpToUsdRate()));

    console.warn(
      `[live-pricing] ${store.name} matched "${query}" -> "${found.name}" @ ${found.price} ${store.currency} ($${priceUsd})`
    );

    return {
      productName: found.name,
      priceLocal: found.price,
      currencyLocal: store.currency,
      priceUsd,
      storeName: store.name,
      listingUrl: found.url,
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
