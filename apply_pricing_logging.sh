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
FILE_EOF_1

cat > src/lib/robopilot/service.ts << 'FILE_EOF_2'
import { generateStructured, ProviderError } from "../ai/providers";
import { fetchLivePrice, usdToApproxEgp, type PriceRegion } from "./live-pricing";
import { AI_DECOMPOSITION_JSON_SCHEMA, buildSystemPrompt, buildUserPrompt } from "./prompt";
import {
  AIDecompositionSchema,
  RequirementInput,
  RoboPilotPlan,
  RoboPilotPlanSchema,
  type Assumption,
  type ComponentLine,
  type TestPlanItem,
} from "./schema";
import {
  ComponentSelection,
  MilestoneInput,
  check_compatibility,
  estimate_bom,
  project_risk,
} from "./tools";

export class ServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Set ROBOPILOT_STUB_MODE=true to skip real provider calls during local dev / CI. */
const isStubMode = () => process.env.ROBOPILOT_STUB_MODE === "true";

/**
 * Live pricing does real network calls, so it's off automatically in stub
 * mode (keeps local dev fast and network-free) and can be force-disabled
 * with ROBOPILOT_LIVE_PRICING=false (used by the API test suite so tests
 * stay deterministic and don't depend on third-party sites being up).
 */
const isLivePricingEnabled = () => !isStubMode() && process.env.ROBOPILOT_LIVE_PRICING !== "false";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Guards against a scraped price that is wildly implausible — e.g. the
 * extractor grabbing an unrelated nearby number (a review count, a
 * "compare" widget value) instead of the actual product price. When the
 * component has a known catalog reference price, the live price must stay
 * within a generous-but-bounded ratio of it. With no reference price, an
 * absolute floor rejects anything too small to plausibly be a real
 * robotics board/sensor/module price. Rejecting a possibly-correct price
 * is a safe failure — it just falls back to the catalog; trusting a wrong
 * one is not.
 */
export function isPlausiblePrice(candidateUsd: number, referenceUsd?: number): boolean {
  if (referenceUsd !== undefined && referenceUsd > 0) {
    const ratio = candidateUsd / referenceUsd;
    return ratio >= 0.15 && ratio <= 6;
  }
  return candidateUsd >= 1.0;
}

/**
 * Overlays a real current price from the region's storefronts onto each BOM
 * line, in parallel. This NEVER touches tools.ts/estimate_bom() — that stays
 * the deterministic, network-free floor. A line that fails live lookup keeps
 * whatever it already had (catalog price, or `not_in_catalog`/$0). A line
 * that was `not_in_catalog` can still pick up a real price here even though
 * its electrical spec remains unverified — priceSource and status are
 * intentionally separate concepts (see schema.ts).
 */
async function enrichBomWithLivePrices(
  lines: ComponentLine[],
  region: PriceRegion
): Promise<{ lines: ComponentLine[]; totalUsd: number; liveHitCount: number }> {
  const enriched = await Promise.all(
    lines.map(async (line): Promise<ComponentLine> => {
      const live = await fetchLivePrice(line.name, region);
      const referenceUsd = line.status === "approved" ? line.unitPriceUsd : undefined;
      const liveIsPlausible = live !== null && isPlausiblePrice(live.priceUsd, referenceUsd);

      if (live && !liveIsPlausible) {
        console.warn(
          `[live-pricing] Rejected implausible price for "${line.name}": $${live.priceUsd} from ${live.storeName} (catalog reference: ${referenceUsd ?? "none"})`
        );
      }

      if (!live || !liveIsPlausible) {
        // Live lookup failed, or returned a price too implausible to trust
        // (see isPlausiblePrice) — keep the catalog price exactly as-is. In
        // Egypt mode, additionally show an approximate EGP figure so the
        // team isn't stuck reading a USD-only number, but it is a unit
        // conversion of the already-known catalog price, NOT a price
        // recalled from an AI model's memory (deliberately avoided — see
        // live-pricing.ts for why).
        if (region === "egypt" && line.status === "approved" && line.unitPriceUsd > 0) {
          return {
            ...line,
            approxLocalPrice: usdToApproxEgp(line.totalPriceUsd),
            approxLocalCurrency: "EGP",
          };
        }
        return line;
      }
      return {
        ...line,
        unitPriceUsd: live.priceUsd,
        totalPriceUsd: round2(live.priceUsd * line.quantity),
        priceSource: "live",
        liveStoreName: live.storeName,
        liveListingUrl: live.listingUrl,
      };
    })
  );

  return {
    lines: enriched,
    totalUsd: round2(enriched.reduce((sum, l) => sum + l.totalPriceUsd, 0)),
    liveHitCount: enriched.filter((l) => l.priceSource === "live").length,
  };
}

/* ---------------------------------------------------------------------- */
/* Deterministic helpers that turn AI output + tool output into the       */
/* remaining structured fields (milestones, tests) — no AI involved.      */
/* ---------------------------------------------------------------------- */

function buildMilestones(blocks: { name: string }[]): MilestoneInput[] {
  return blocks.map((block, i) => {
    const previous = i === 0 ? undefined : blocks[i - 1];
    return {
      name: `Build: ${block.name}`,
      description: `Implement, wire and validate the ${block.name} block.`,
      dependsOn: previous ? [`Build: ${previous.name}`] : [],
      estimatedDays: 3,
    };
  });
}

function buildTestPlan(
  blocks: { name: string }[],
  selections: ComponentSelection[]
): TestPlanItem[] {
  const blockTests: TestPlanItem[] = blocks.map((b) => ({
    target: b.name,
    description: `Bench-test the ${b.name} block in isolation before integrating it with the rest of the system.`,
    expectedResult: `${b.name} produces its documented outputs given valid inputs.`,
  }));

  const componentTests: TestPlanItem[] = selections.map((s) => ({
    target: s.candidateName,
    description: `Power up ${s.candidateName} alone and confirm it draws the expected current with no faults.`,
    expectedResult: `${s.candidateName} initializes without errors and responds on its documented interface.`,
  }));

  return [...blockTests, ...componentTests];
}

function buildStubDecomposition() {
  return {
    architecture_blocks: [
      {
        name: "Sensing",
        purpose: "Detect obstacle distance and orientation.",
        inputs: ["environment"],
        outputs: ["distance_cm", "heading_deg"],
      },
      {
        name: "Control",
        purpose: "Decide motor commands from sensor readings.",
        inputs: ["distance_cm", "heading_deg"],
        outputs: ["motor_command"],
      },
      {
        name: "Actuation",
        purpose: "Drive motors based on control commands.",
        inputs: ["motor_command"],
        outputs: ["motion"],
      },
    ],
    proposed_components: [
      {
        role: "microcontroller",
        candidateName: "ESP32-WROOM-32 DevKit",
        quantity: 1,
        justification: "Wi-Fi-capable MCU suitable for a sensor/actuator prototype.",
      },
      {
        role: "distance sensor",
        candidateName: "HC-SR04",
        quantity: 1,
        justification: "Low-cost ultrasonic distance sensing for obstacle detection.",
      },
      {
        role: "motor driver",
        candidateName: "L298N",
        quantity: 1,
        justification: "Dual H-bridge driver suitable for two DC motors.",
      },
    ],
    assumptions: [
      {
        statement: "This is a stub response generated for local development.",
        reason: "ROBOPILOT_STUB_MODE is enabled; no AI provider was called.",
      },
    ] as Assumption[],
  };
}

/* ---------------------------------------------------------------------- */
/* Main entry point used by the route handler.                            */
/* ---------------------------------------------------------------------- */

export async function generatePlan(input: RequirementInput): Promise<RoboPilotPlan> {
  const warnings: string[] = [];
  let providerUsed: "groq" | "gemini" | "stub";
  let decomposition: ReturnType<typeof buildStubDecomposition>;

  if (isStubMode()) {
    decomposition = buildStubDecomposition();
    providerUsed = "stub";
  } else {
    let raw: unknown;
    try {
      const result = await generateStructured({
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt(input),
        jsonSchema: AI_DECOMPOSITION_JSON_SCHEMA,
        schemaName: "robopilot_decomposition",
      });
      raw = result.data;
      providerUsed = result.providerUsed;
    } catch (err) {
      if (err instanceof ProviderError) {
        throw new ServiceError(
          "The AI planning service is temporarily unavailable. Please try again shortly.",
          502,
          "PROVIDER_UNAVAILABLE"
        );
      }
      throw err;
    }

    const parsed = AIDecompositionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ServiceError(
        "The AI provider's response did not match the required schema.",
        502,
        "AI_SCHEMA_MISMATCH"
      );
    }
    decomposition = parsed.data;
  }

  // --- Deterministic post-processing (never trust the model for these) ---
  const selections: ComponentSelection[] = decomposition.proposed_components.map((c) => ({
    role: c.role,
    candidateName: c.candidateName,
    quantity: c.quantity,
  }));

  const bom = estimate_bom(selections);
  if (bom.unresolvedCount > 0) {
    warnings.push(
      `${bom.unresolvedCount} proposed component(s) could not be matched to the approved catalog and are marked "not_in_catalog".`
    );
  }

  // --- Live pricing (best-effort enhancement — see live-pricing.ts) ---
  let bomLines = bom.lines;
  let bomTotalUsd = bom.totalUsd;
  if (isLivePricingEnabled()) {
    try {
      const enriched = await enrichBomWithLivePrices(bom.lines, input.priceRegion);
      bomLines = enriched.lines;
      bomTotalUsd = enriched.totalUsd;
      if (enriched.liveHitCount > 0) {
        const regionLabel = input.priceRegion === "egypt" ? "Egyptian" : "international";
        warnings.push(
          `${enriched.liveHitCount} of ${bomLines.length} component price(s) were fetched live from ${regionLabel} stores; remaining prices use the approved catalog.`
        );
      }
    } catch {
      // Live pricing must never break plan generation — keep catalog prices.
    }
  }

  const compatibility = check_compatibility(selections);
  const incompatibleCount = compatibility.filter((c) => !c.compatible).length;
  if (incompatibleCount > 0) {
    warnings.push(`${incompatibleCount} component pair(s) failed the logic-level compatibility check.`);
  }

  const milestones = buildMilestones(decomposition.architecture_blocks);
  const totalEstimatedDays = milestones.reduce((sum, m) => sum + m.estimatedDays, 0);

  const risks = project_risk(milestones, {
    unresolvedComponentCount: bom.unresolvedCount,
    totalComponentCount: selections.length,
    incompatiblePairCount: incompatibleCount,
    totalEstimatedDays,
    budgetUsd: input.budgetUsd,
    bomTotalUsd, // post-live-pricing total, more accurate than the catalog-only figure
  });

  const tests = buildTestPlan(decomposition.architecture_blocks, selections);

  const plan: RoboPilotPlan = {
    requirements: input.requirements,
    constraints: input.constraints,
    architecture_blocks: decomposition.architecture_blocks,
    components: bomLines,
    compatibility_checks: compatibility,
    bom_items: bomLines,
    bom_total_usd: bomTotalUsd,
    milestones,
    risks,
    tests,
    assumptions: decomposition.assumptions,
    meta: {
      provider_used: providerUsed,
      generated_at: new Date().toISOString(),
      priceRegion: input.priceRegion,
      warnings,
    },
  };

  const validated = RoboPilotPlanSchema.safeParse(plan);
  if (!validated.success) {
    // This would mean our own assembly code produced something invalid —
    // fail loudly rather than ship a malformed response to the UI.
    throw new ServiceError("Failed to assemble a valid plan.", 500, "PLAN_ASSEMBLY_FAILED");
  }

  return validated.data;
}
FILE_EOF_2

echo "Done. Run: npm run typecheck && npm test (expect 44 passed)"
