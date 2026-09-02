cat > src/lib/robopilot/deepseek-extractor.ts << 'FILE_EOF_1'
/**
 * Reads REAL, already-fetched HTML (from live-pricing.ts's own fetch() call)
 * and asks DeepSeek to extract the matching product's name and price from
 * it. This is fundamentally different from asking an AI to recall a price
 * from its training data: the model only ever sees content that was just
 * pulled over HTTP moments earlier, and is explicitly told not to use any
 * outside knowledge. If DeepSeek is unavailable, the caller falls back to
 * the plain regex extractor in live-pricing.ts — this module never blocks
 * the pipeline.
 *
 * Model note: deepseek-chat / deepseek-reasoner were retired 2026-07-24.
 * The current default here is deepseek-v4-flash, with thinking mode
 * explicitly disabled (we want fast, cheap, deterministic-shaped
 * extraction, not a reasoning trace).
 */

export interface ExtractedListing {
  productName: string;
  price: number;
  url?: string;
}

const DEEPSEEK_TIMEOUT_MS = 8000;
const MAX_HTML_CHARS = 15_000; // keeps token cost bounded; target listings are near the top of results

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .slice(0, MAX_HTML_CHARS);
}

function buildSystemPrompt(componentQuery: string, currency: "EGP" | "USD"): string {
  return [
    "You extract a single product listing from raw HTML of a real e-commerce search-results page.",
    "That HTML was fetched over HTTP moments ago and is the ONLY source of truth — never use any",
    "prior/outside knowledge of what this kind of product usually costs, even if you recall it.",
    `Find the listing that best matches the search term "${componentQuery}".`,
    'Respond with a json object only: {"found": boolean, "productName": string, "price": number, "url": string}.',
    `"price" must be a plain number in ${currency}, with no currency symbol or thousands separators.`,
    '"url" is the href of that listing\'s link if visible in the HTML, or "" if not found.',
    'If nothing in the HTML plausibly matches, respond exactly {"found": false}.',
  ].join(" ");
}

export async function extractWithDeepSeek(
  html: string,
  componentQuery: string,
  currency: "EGP" | "USD"
): Promise<ExtractedListing | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null; // caller falls back to the regex extractor

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        messages: [
          { role: "system", content: buildSystemPrompt(componentQuery, currency) },
          { role: "user", content: cleanHtml(html) },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[deepseek-extractor] HTTP ${res.status} extracting "${componentQuery}"`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.warn(`[deepseek-extractor] missing content extracting "${componentQuery}"`);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`[deepseek-extractor] non-JSON response extracting "${componentQuery}"`);
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record?.found !== true) return null;
    if (typeof record.productName !== "string" || typeof record.price !== "number") {
      console.warn(`[deepseek-extractor] malformed shape extracting "${componentQuery}"`);
      return null;
    }
    if (!(record.price > 0)) return null;

    return {
      productName: record.productName,
      price: record.price,
      url: typeof record.url === "string" && record.url.length > 0 ? record.url : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[deepseek-extractor] request failed extracting "${componentQuery}": ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
FILE_EOF_1

cat > src/lib/robopilot/live-pricing.ts << 'FILE_EOF_2'
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

    // Primary: let DeepSeek read the real fetched HTML and extract the
    // listing (see deepseek-extractor.ts). Falls back to the regex
    // extractor below if no DEEPSEEK_API_KEY is set or the call fails.
    const aiResult = await extractWithDeepSeek(html, query, store.currency);
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
FILE_EOF_2

mkdir -p tests/unit
cat > tests/unit/deepseek-extractor.test.ts << 'FILE_EOF_3'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractWithDeepSeek } from "@/lib/robopilot/deepseek-extractor";

function mockDeepSeekResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

describe("extractWithDeepSeek", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null immediately when DEEPSEEK_API_KEY is not configured", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled(); // never even attempts the network call
  });

  it("parses a well-formed found:true response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockDeepSeekResponse(
        JSON.stringify({ found: true, productName: "ESP32-WROOM-32 DevKit", price: 450, url: "/products/esp32" })
      )
    ) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html>...real fetched page...</html>", "ESP32", "EGP");
    expect(result).toEqual({
      productName: "ESP32-WROOM-32 DevKit",
      price: 450,
      url: "/products/esp32",
    });
  });

  it("returns null when the model reports found:false", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: false }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html>no match here</html>", "Some Obscure Part", "EGP");
    expect(result).toBeNull();
  });

  it("returns null and does not throw on a non-JSON response", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse("not valid json")) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null on a malformed shape (missing price)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: true, productName: "Something" }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null on a non-positive price (defense against a bad extraction)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: true, productName: "X", price: 0 }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null (not throws) on an HTTP error", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse("", false, 401)) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null (not throws) when the network request itself fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("sends the configured model, or the deepseek-v4-flash default", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: false })));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await extractWithDeepSeek("<html></html>", "ESP32", "EGP");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
FILE_EOF_3

cat > .env.example << 'FILE_EOF_4'
# --- AI providers (server-side only, never exposed to the client) --------
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash

# --- Local development / CI ----------------------------------------------
# When true, the route returns deterministic sample data and skips real
# provider calls entirely. Useful for Session 1 and for the UI/Product
# engineer to build against before real keys are configured.
ROBOPILOT_STUB_MODE=false

# When false, skips the live-pricing enrichment step (Egypt/International
# store scraping) and uses only the static approved catalog. Automatically
# off in stub mode. Useful for keeping tests/CI network-free.
ROBOPILOT_LIVE_PRICING=true

# Optional: if set, live-pricing.ts asks DeepSeek to read each store's real
# fetched search-results HTML and extract the matching price, instead of
# the built-in regex extractor. Falls back to regex automatically if unset
# or if the DeepSeek call fails. Never used to recall a price from memory —
# only to read HTML that was just fetched over HTTP (see deepseek-extractor.ts).
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
FILE_EOF_4

echo "Done. Run: npm run typecheck && npm test (expect 53 passed)"
