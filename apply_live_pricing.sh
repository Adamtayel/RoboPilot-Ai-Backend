mkdir -p src/lib/robopilot
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
    if (!res.ok) return null;
    const html = await res.text();
    const found = extractBestMatch(html, url, store.currency);
    if (!found) return null;

    const priceUsd = store.currency === "USD" ? found.price : round2(found.price * (await getEgpToUsdRate()));

    return {
      productName: found.name,
      priceLocal: found.price,
      currencyLocal: store.currency,
      priceUsd,
      storeName: store.name,
      listingUrl: found.url,
    };
  } catch {
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

cat > src/lib/robopilot/schema.ts << 'FILE_EOF_2'
import { z } from "zod";

/**
 * ============================================================================
 * INPUT CONTRACT — what the client (Product UI) sends to POST /api/robopilot
 * ============================================================================
 */
export const RequirementInputSchema = z.object({
  projectName: z.string().min(3).max(120),
  requirements: z.array(z.string().min(3).max(500)).min(1).max(20),
  constraints: z.array(z.string().min(3).max(500)).max(20).default([]),
  budgetUsd: z.number().positive().max(100_000).optional(),
  targetPlatform: z.enum(["arduino", "esp32", "unspecified"]).default("unspecified"),
  priceRegion: z.enum(["egypt", "international"]).default("egypt"),
});
export type RequirementInput = z.infer<typeof RequirementInputSchema>;

/**
 * ============================================================================
 * AI-DECOMPOSITION CONTRACT — the ONLY thing the language model is allowed to
 * produce. Pricing, compatibility, milestones and risk are computed
 * deterministically afterwards (see tools.ts) — never generated by the model.
 * ============================================================================
 */
export const ArchitectureBlockSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
});
export type ArchitectureBlock = z.infer<typeof ArchitectureBlockSchema>;

export const ProposedComponentSchema = z.object({
  role: z.string(),
  candidateName: z.string(),
  quantity: z.number().int().positive(),
  justification: z.string(),
});
export type ProposedComponent = z.infer<typeof ProposedComponentSchema>;

export const AssumptionSchema = z.object({
  statement: z.string(),
  reason: z.string(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const AIDecompositionSchema = z.object({
  architecture_blocks: z.array(ArchitectureBlockSchema).min(1).max(10),
  proposed_components: z.array(ProposedComponentSchema).min(1).max(15),
  assumptions: z.array(AssumptionSchema).max(10),
});
export type AIDecomposition = z.infer<typeof AIDecompositionSchema>;

/**
 * ============================================================================
 * DETERMINISTIC TOOL OUTPUT CONTRACTS
 * ============================================================================
 */
export const ComponentLineSchema = z.object({
  role: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceUsd: z.number().nonnegative(),
  totalPriceUsd: z.number().nonnegative(),
  datasheetUrl: z.string(),
  status: z.enum(["approved", "not_in_catalog"]),
  priceSource: z.enum(["catalog", "live", "unavailable"]).default("catalog"),
  liveStoreName: z.string().optional(),
  liveListingUrl: z.string().optional(),
  approxLocalPrice: z.number().nonnegative().optional(),
  approxLocalCurrency: z.enum(["EGP"]).optional(),
});
export type ComponentLine = z.infer<typeof ComponentLineSchema>;

export const CompatibilityCheckSchema = z.object({
  componentA: z.string(),
  componentB: z.string(),
  interface: z.string(),
  compatible: z.boolean(),
  reason: z.string(),
});
export type CompatibilityCheck = z.infer<typeof CompatibilityCheckSchema>;

export const MilestoneSchema = z.object({
  name: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()),
  estimatedDays: z.number().positive(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const RiskSchema = z.object({
  category: z.enum(["schedule", "technical", "budget", "component_availability"]),
  description: z.string(),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  score: z.number().min(1).max(9),
  mitigation: z.string(),
});
export type Risk = z.infer<typeof RiskSchema>;

export const TestPlanItemSchema = z.object({
  target: z.string(),
  description: z.string(),
  expectedResult: z.string(),
});
export type TestPlanItem = z.infer<typeof TestPlanItemSchema>;

/**
 * ============================================================================
 * FINAL RESPONSE CONTRACT — returned by POST /api/robopilot
 * ============================================================================
 */
export const RoboPilotPlanSchema = z.object({
  requirements: z.array(z.string()),
  constraints: z.array(z.string()),
  architecture_blocks: z.array(ArchitectureBlockSchema),
  components: z.array(ComponentLineSchema),
  compatibility_checks: z.array(CompatibilityCheckSchema),
  bom_items: z.array(ComponentLineSchema),
  bom_total_usd: z.number().nonnegative(),
  milestones: z.array(MilestoneSchema),
  risks: z.array(RiskSchema),
  tests: z.array(TestPlanItemSchema),
  assumptions: z.array(AssumptionSchema),
  meta: z.object({
    provider_used: z.enum(["groq", "gemini", "stub"]),
    generated_at: z.string(),
    priceRegion: z.enum(["egypt", "international"]),
    warnings: z.array(z.string()),
  }),
});
export type RoboPilotPlan = z.infer<typeof RoboPilotPlanSchema>;
FILE_EOF_2

cat > src/lib/robopilot/service.ts << 'FILE_EOF_3'
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
      if (!live) {
        // Live lookup failed — keep the catalog price exactly as-is. In
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
FILE_EOF_3

cat > src/lib/robopilot/tools.ts << 'FILE_EOF_4'
import approvedComponentsRaw from "./data/approved-components.json";

/**
 * These three functions are the project's "deterministic tool / action"
 * requirement: given the same input they always return the same output,
 * they never call an AI provider, and every price/compatibility/risk claim
 * is traceable to the approved component catalog below.
 */

export interface ApprovedComponent {
  name: string;
  aliases: string[];
  category: "microcontroller" | "sensor" | "actuator" | "actuator_driver" | "power";
  operatingVoltageV: [number, number];
  logicLevelV: number[];
  interface: "I2C" | "SPI" | "UART" | "GPIO" | "PWM" | "Analog" | "USB";
  unitPriceUsd: number;
  datasheetUrl: string;
}

const approvedComponents = approvedComponentsRaw as ApprovedComponent[];

/**
 * Resolves a proposed component name against the approved catalog.
 *
 * 1. Exact match (case-insensitive) on the canonical name or a known alias.
 * 2. Fallback: substring match either direction against the canonical name
 *    or an alias. This deliberately stays permissive only in one narrow way —
 *    the catalog's own name/alias must appear verbatim inside the proposed
 *    name (or vice versa) — so "DHT22 (AM2302) temperature/humidity sensor"
 *    still resolves to our "DHT22" entry, but an unrelated part won't
 *    accidentally match. A 3-character floor avoids trivial substrings.
 */
export function findApprovedComponent(name: string): ApprovedComponent | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;

  const exact = approvedComponents.find(
    (c) => c.name.toLowerCase() === needle || c.aliases.some((a) => a.toLowerCase() === needle)
  );
  if (exact) return exact;

  return approvedComponents.find((c) => {
    const known = [c.name.toLowerCase(), ...c.aliases.map((a) => a.toLowerCase())];
    return known.some((k) => k.length >= 3 && (needle.includes(k) || k.includes(needle)));
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------------------------------------------------------------------- */
/* estimate_bom()                                                         */
/* ---------------------------------------------------------------------- */

export interface ComponentSelection {
  role: string;
  candidateName: string;
  quantity: number;
}

export interface BomLine {
  role: string;
  name: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
  datasheetUrl: string;
  status: "approved" | "not_in_catalog";
  priceSource: "catalog" | "live" | "unavailable";
  liveStoreName?: string;
  liveListingUrl?: string;
}

export interface BomEstimate {
  lines: BomLine[];
  totalUsd: number;
  unresolvedCount: number;
}

/**
 * Totals only components that are traceable to the approved catalog.
 * Anything not found is flagged `not_in_catalog` with a zero price rather
 * than guessed — the caller decides how to surface that to the user.
 */
export function estimate_bom(selections: ComponentSelection[]): BomEstimate {
  const lines: BomLine[] = selections.map((sel) => {
    const match = findApprovedComponent(sel.candidateName);
    if (!match) {
      return {
        role: sel.role,
        name: sel.candidateName,
        quantity: sel.quantity,
        unitPriceUsd: 0,
        totalPriceUsd: 0,
        datasheetUrl: "",
        status: "not_in_catalog",
        priceSource: "catalog",
      };
    }
    return {
      role: sel.role,
      name: match.name,
      quantity: sel.quantity,
      unitPriceUsd: match.unitPriceUsd,
      totalPriceUsd: round2(match.unitPriceUsd * sel.quantity),
      datasheetUrl: match.datasheetUrl,
      status: "approved",
      priceSource: "catalog",
    };
  });

  return {
    lines,
    totalUsd: round2(lines.reduce((sum, l) => sum + l.totalPriceUsd, 0)),
    unresolvedCount: lines.filter((l) => l.status === "not_in_catalog").length,
  };
}

/* ---------------------------------------------------------------------- */
/* check_compatibility()                                                  */
/* ---------------------------------------------------------------------- */

export interface CompatibilityResult {
  componentA: string;
  componentB: string;
  interface: string;
  compatible: boolean;
  reason: string;
}

/**
 * Checks every peripheral against every selected microcontroller for a
 * logic-level overlap. This intentionally only verifies what the catalog
 * can prove (voltage/interface); it never claims a pair was physically
 * tested.
 */
export function check_compatibility(selections: ComponentSelection[]): CompatibilityResult[] {
  const resolved = selections
    .map((sel) => ({ sel, comp: findApprovedComponent(sel.candidateName) }))
    .filter((r): r is { sel: ComponentSelection; comp: ApprovedComponent } => Boolean(r.comp));

  const controllers = resolved.filter((r) => r.comp.category === "microcontroller");
  const peripherals = resolved.filter((r) => r.comp.category !== "microcontroller");

  const results: CompatibilityResult[] = [];

  for (const controller of controllers) {
    for (const peripheral of peripherals) {
      const logicOverlap = peripheral.comp.logicLevelV.some((v) =>
        controller.comp.logicLevelV.includes(v)
      );
      results.push({
        componentA: controller.comp.name,
        componentB: peripheral.comp.name,
        interface: peripheral.comp.interface,
        compatible: logicOverlap,
        reason: logicOverlap
          ? `${peripheral.comp.name} logic level (${peripheral.comp.logicLevelV.join("/")}V) matches ${controller.comp.name} (${controller.comp.logicLevelV.join("/")}V) on ${peripheral.comp.interface}.`
          : `${peripheral.comp.name} operates at ${peripheral.comp.logicLevelV.join("/")}V logic but ${controller.comp.name} only supports ${controller.comp.logicLevelV.join("/")}V — a logic-level shifter is required on ${peripheral.comp.interface}.`,
      });
    }
  }

  return results;
}

/* ---------------------------------------------------------------------- */
/* project_risk()                                                         */
/* ---------------------------------------------------------------------- */

export interface MilestoneInput {
  name: string;
  description: string;
  dependsOn: string[];
  estimatedDays: number;
}

export interface RiskAssessmentContext {
  unresolvedComponentCount: number;
  totalComponentCount: number;
  incompatiblePairCount: number;
  totalEstimatedDays: number;
  budgetUsd?: number;
  bomTotalUsd: number;
}

export interface Risk {
  category: "schedule" | "technical" | "budget" | "component_availability";
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  score: number;
  mitigation: string;
}

type Level = "low" | "medium" | "high";
const LEVEL_WEIGHT: Record<Level, number> = { low: 1, medium: 2, high: 3 };
const riskScore = (likelihood: Level, impact: Level) => LEVEL_WEIGHT[likelihood] * LEVEL_WEIGHT[impact];

function longestDependencyChain(milestones: MilestoneInput[]): number {
  if (milestones.length === 0) return 0;
  const byName = new Map(milestones.map((m) => [m.name, m]));
  const memo = new Map<string, number>();

  function depth(name: string, seen: Set<string>): number {
    if (memo.has(name)) return memo.get(name)!;
    if (seen.has(name)) return 0; // cycle guard — never trust unverified AI ordering
    const m = byName.get(name);
    if (!m || m.dependsOn.length === 0) {
      memo.set(name, 1);
      return 1;
    }
    const nextSeen = new Set(seen).add(name);
    const d = 1 + Math.max(...m.dependsOn.map((dep) => depth(dep, nextSeen)));
    memo.set(name, d);
    return d;
  }

  return Math.max(...milestones.map((m) => depth(m.name, new Set())));
}

/**
 * Deterministically scores schedule, component-availability, technical and
 * budget risk from measurable inputs (dependency depth, unresolved parts,
 * incompatible pairs, BOM total vs. stated budget). No risk is invented by
 * an AI provider.
 */
export function project_risk(milestones: MilestoneInput[], ctx: RiskAssessmentContext): Risk[] {
  const risks: Risk[] = [];

  const maxChain = longestDependencyChain(milestones);
  const scheduleLikelihood: Level = maxChain >= 4 ? "high" : maxChain >= 2 ? "medium" : "low";
  const scheduleImpact: Level =
    ctx.totalEstimatedDays > 30 ? "high" : ctx.totalEstimatedDays > 14 ? "medium" : "low";
  risks.push({
    category: "schedule",
    description: `Milestone dependency chain is ${maxChain} step(s) deep across an estimated ${ctx.totalEstimatedDays} day(s).`,
    likelihood: scheduleLikelihood,
    impact: scheduleImpact,
    score: riskScore(scheduleLikelihood, scheduleImpact),
    mitigation: "Parallelize independent milestones and add buffer days after the longest dependency chain.",
  });

  if (ctx.unresolvedComponentCount > 0) {
    const likelihood: Level = ctx.unresolvedComponentCount >= 3 ? "high" : "medium";
    risks.push({
      category: "component_availability",
      description: `${ctx.unresolvedComponentCount} proposed component(s) are not in the approved catalog and are unverified.`,
      likelihood,
      impact: "medium",
      score: riskScore(likelihood, "medium"),
      mitigation:
        "Replace unresolved components with an approved equivalent, or get lead/instructor sign-off on a new datasheet before purchase.",
    });
  }

  if (ctx.incompatiblePairCount > 0) {
    const likelihood: Level = ctx.incompatiblePairCount >= 2 ? "high" : "medium";
    risks.push({
      category: "technical",
      description: `${ctx.incompatiblePairCount} component pair(s) have a logic-level or interface mismatch.`,
      likelihood,
      impact: "high",
      score: riskScore(likelihood, "high"),
      mitigation: "Add a logic-level shifter, or choose a compatible module variant, before wiring.",
    });
  }

  if (ctx.budgetUsd !== undefined) {
    const allUnresolved =
      ctx.totalComponentCount > 0 && ctx.unresolvedComponentCount === ctx.totalComponentCount;
    const someUnresolved = ctx.unresolvedComponentCount > 0 && !allUnresolved;

    if (allUnresolved) {
      // We have literally no priced components — a BOM total of $0 here means
      // "unknown", not "cheap". Reporting this as low risk would be exactly
      // the kind of false confidence this project is designed to avoid.
      risks.push({
        category: "budget",
        description: `Budget cannot be assessed: 0 of ${ctx.totalComponentCount} proposed component(s) have a verified price against a stated budget of $${ctx.budgetUsd.toFixed(2)}.`,
        likelihood: "medium",
        impact: "medium",
        score: riskScore("medium", "medium"),
        mitigation:
          "Resolve component names against the approved catalog, or manually price the unresolved parts, before treating this project as within budget.",
      });
    } else {
      const overBudget = ctx.bomTotalUsd > ctx.budgetUsd;
      const ratio = ctx.bomTotalUsd / ctx.budgetUsd;
      // With unresolved parts still in the mix, an under-budget reading isn't
      // fully trustworthy — the real total can only go up once they're priced.
      const likelihood: Level = overBudget
        ? ratio > 1.25
          ? "high"
          : "medium"
        : someUnresolved
          ? "medium"
          : "low";
      const impact: Level = overBudget ? "high" : someUnresolved ? "medium" : "low";
      const caveat = someUnresolved
        ? ` (${ctx.unresolvedComponentCount} of ${ctx.totalComponentCount} component(s) are unpriced and not included in this total, so the real cost may be higher)`
        : "";
      risks.push({
        category: "budget",
        description: `Estimated BOM total is $${ctx.bomTotalUsd.toFixed(2)} against a stated budget of $${ctx.budgetUsd.toFixed(2)}${caveat}.`,
        likelihood,
        impact,
        score: riskScore(likelihood, impact),
        mitigation: overBudget
          ? "Substitute lower-cost approved alternatives or reduce component quantities."
          : someUnresolved
            ? "Resolve the remaining unpriced components before confirming this project is within budget."
            : "No action needed; monitor for scope creep.",
      });
    }
  }

  return risks.sort((a, b) => b.score - a.score);
}
FILE_EOF_4

cat > src/app/api/robopilot/route.ts << 'FILE_EOF_5'
import { NextRequest, NextResponse } from "next/server";
import { RequirementInputSchema } from "@/lib/robopilot/schema";
import { generatePlan, ServiceError } from "@/lib/robopilot/service";

// Must run in the Node.js runtime (not Edge) — provider calls need standard fetch + env access.
export const runtime = "nodejs";
// Live pricing does several outbound fetches in parallel; give it headroom
// beyond Vercel's default. (Hobby-tier projects may still cap lower — see
// docs/architecture.md for the fallback behavior if that happens.)
export const maxDuration = 30;

const MAX_BODY_BYTES = 20_000;

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = RequirementInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request did not match the required schema.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const plan = await generatePlan(parsed.data);
    return NextResponse.json(plan, { status: 200 });
  } catch (err) {
    if (err instanceof ServiceError) {
      // Safe, user-facing message only — never leak provider error internals or secrets.
      console.error(`[robopilot] ${err.code}: ${err.message}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error("[robopilot] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405 });
}
FILE_EOF_5

cat > src/components/robopilot/IntakeForm.tsx << 'FILE_EOF_6'
"use client";

import { useState } from "react";

export interface PlanRequestBody {
  projectName: string;
  requirements: string[];
  constraints: string[];
  budgetUsd?: number;
  targetPlatform: "arduino" | "esp32" | "unspecified";
  priceRegion: "egypt" | "international";
}

interface IntakeFormProps {
  onSubmit: (body: PlanRequestBody) => void;
  disabled: boolean;
}

const EXAMPLE = {
  projectName: "Line-following rover",
  requirements: [
    "Detect obstacles within 30cm",
    "Follow a black line on a white floor",
  ],
  constraints: ["Budget under $80"],
};

export function IntakeForm({ onSubmit, disabled }: IntakeFormProps) {
  const [projectName, setProjectName] = useState("");
  const [requirements, setRequirements] = useState<string[]>([""]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [budgetUsd, setBudgetUsd] = useState("");
  const [targetPlatform, setTargetPlatform] =
    useState<PlanRequestBody["targetPlatform"]>("unspecified");
  const [priceRegion, setPriceRegion] = useState<PlanRequestBody["priceRegion"]>("egypt");
  const [formError, setFormError] = useState<string | null>(null);

  function updateListItem(
    list: string[],
    setList: (v: string[]) => void,
    index: number,
    value: string
  ) {
    const next = [...list];
    next[index] = value;
    setList(next);
  }

  function removeListItem(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  function fillExample() {
    setProjectName(EXAMPLE.projectName);
    setRequirements(EXAMPLE.requirements);
    setConstraints(EXAMPLE.constraints);
    setBudgetUsd("80");
    setTargetPlatform("esp32");
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanedRequirements = requirements.map((r) => r.trim()).filter(Boolean);
    const cleanedConstraints = constraints.map((c) => c.trim()).filter(Boolean);

    if (projectName.trim().length < 3) {
      setFormError("Project name needs at least 3 characters.");
      return;
    }
    if (cleanedRequirements.length === 0) {
      setFormError("Add at least one requirement.");
      return;
    }

    const body: PlanRequestBody = {
      projectName: projectName.trim(),
      requirements: cleanedRequirements,
      constraints: cleanedConstraints,
      targetPlatform,
      priceRegion,
    };

    const parsedBudget = budgetUsd.trim() === "" ? undefined : Number(budgetUsd);
    if (parsedBudget !== undefined) {
      if (Number.isNaN(parsedBudget) || parsedBudget <= 0) {
        setFormError("Budget must be a positive number.");
        return;
      }
      body.budgetUsd = parsedBudget;
    }

    onSubmit(body);
  }

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <div className="field">
        <label className="field__label" htmlFor="projectName">
          Project name
        </label>
        <input
          id="projectName"
          className="input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. Line-following rover"
          disabled={disabled}
        />
      </div>

      <div className="field">
        <span className="field__label">Requirements</span>
        {requirements.map((req, i) => (
          <div className="list-row" key={i}>
            <input
              className="input"
              value={req}
              onChange={(e) => updateListItem(requirements, setRequirements, i, e.target.value)}
              placeholder="What should it do?"
              disabled={disabled}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeListItem(requirements, setRequirements, i)}
              disabled={disabled || requirements.length === 1}
              aria-label="Remove requirement"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-row-btn"
          onClick={() => setRequirements([...requirements, ""])}
          disabled={disabled}
        >
          + Add requirement
        </button>
      </div>

      <div className="field">
        <span className="field__label">Constraints (optional)</span>
        {constraints.map((c, i) => (
          <div className="list-row" key={i}>
            <input
              className="input"
              value={c}
              onChange={(e) => updateListItem(constraints, setConstraints, i, e.target.value)}
              placeholder="e.g. Must run on battery power"
              disabled={disabled}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeListItem(constraints, setConstraints, i)}
              disabled={disabled}
              aria-label="Remove constraint"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-row-btn"
          onClick={() => setConstraints([...constraints, ""])}
          disabled={disabled}
        >
          + Add constraint
        </button>
      </div>

      <div className="field">
        <span className="field__label">Component pricing</span>
        <div className="region-toggle" role="group" aria-label="Component pricing region">
          <button
            type="button"
            className={priceRegion === "egypt" ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("egypt")}
            disabled={disabled}
            aria-pressed={priceRegion === "egypt"}
          >
            🇪🇬 Egypt Mode
          </button>
          <button
            type="button"
            className={priceRegion === "international" ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("international")}
            disabled={disabled}
            aria-pressed={priceRegion === "international"}
          >
            🌍 International Mode
          </button>
        </div>
        <p className="field__hint">
          {priceRegion === "egypt"
            ? "Prices checked live against Electra Store, Makers Electronics and Future Electronics Egypt."
            : "Prices checked live against SparkFun."}
        </p>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field__label" htmlFor="budget">
            Budget (USD, optional)
          </label>
          <input
            id="budget"
            className="input"
            inputMode="decimal"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            placeholder="e.g. 80"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="platform">
            Target platform
          </label>
          <select
            id="platform"
            className="select"
            value={targetPlatform}
            onChange={(e) =>
              setTargetPlatform(e.target.value as PlanRequestBody["targetPlatform"])
            }
            disabled={disabled}
          >
            <option value="unspecified">No preference</option>
            <option value="esp32">ESP32</option>
            <option value="arduino">Arduino</option>
          </select>
        </div>
      </div>

      {formError && <p className="error-text">{formError}</p>}

      <div className="submit-row">
        <button type="submit" className="btn-primary" disabled={disabled}>
          {disabled ? "Generating…" : "Generate plan"}
        </button>
        <button type="button" className="btn-secondary" onClick={fillExample} disabled={disabled}>
          Fill example
        </button>
      </div>
    </form>
  );
}
FILE_EOF_6

cat > src/components/robopilot/BomTable.tsx << 'FILE_EOF_7'
import type { ComponentLine } from "@/lib/robopilot/schema";

export function BomTable({ lines, totalUsd }: { lines: ComponentLine[]; totalUsd: number }) {
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Component</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Total</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={`${line.name}-${i}`}>
                <td>{line.role}</td>
                <td className="mono">
                  {line.status === "approved" && line.datasheetUrl ? (
                    <a href={line.datasheetUrl} target="_blank" rel="noreferrer">
                      {line.name}
                    </a>
                  ) : (
                    line.name
                  )}
                </td>
                <td className="num">{line.quantity}</td>
                <td className="num">${line.unitPriceUsd.toFixed(2)}</td>
                <td className="num">
                  ${line.totalPriceUsd.toFixed(2)}
                  {line.approxLocalPrice !== undefined && (
                    <div style={{ color: "var(--ink-faint)", fontSize: 11 }}>
                      ≈ {line.approxLocalPrice.toLocaleString()} {line.approxLocalCurrency}
                    </div>
                  )}
                </td>
                <td>
                  {line.priceSource === "live" && line.liveListingUrl ? (
                    <a href={line.liveListingUrl} target="_blank" rel="noreferrer" className="mono">
                      {line.liveStoreName ?? "live"}
                    </a>
                  ) : (
                    <span className="mono" style={{ color: "var(--ink-faint)" }}>
                      catalog
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={
                      line.status === "approved" ? "status-pill status-pill--ok" : "status-pill status-pill--warn"
                    }
                  >
                    {line.status === "approved" ? "approved" : "not in catalog"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bom-total">
        <span>BOM total</span>
        <strong>${totalUsd.toFixed(2)}</strong>
      </div>
    </div>
  );
}
FILE_EOF_7

cat > src/app/globals.css << 'FILE_EOF_8'
/* ============================================================================
   RoboPilot design system
   Concept: a populated circuit board under a bench light — deep solder-mask
   green, warm copper-trace accent, silkscreen-ink text. Tables read as real
   datasheet tables, not disguised cards. Status colors are load-bearing
   (they mean approved/compatible/risk-level), never decorative.
   ============================================================================ */

:root {
  /* Surfaces */
  --bg: #0b1f17;
  --panel: #143324;
  --panel-raised: #1c4530;
  --line: #2a5940;
  --line-soft: #1f462f;

  /* Text */
  --ink: #ede9dd;
  --ink-dim: #a8b5ac;
  --ink-faint: #6f8478;

  /* Accent */
  --copper: #c97d3e;
  --copper-bright: #e39a5c;
  --trace-teal: #6fbfa8;

  /* Semantic */
  --warn: #e0a94b;
  --danger: #d2665a;
  --ok: #6fbfa8;

  /* Type */
  --font-display: "Space Grotesk", "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;

  /* Rhythm */
  --radius: 3px;
  --max-form: 720px;
  --max-results: 1040px;
}

* {
  box-sizing: border-box;
}

html,
body {
  padding: 0;
  margin: 0;
}

body {
  background-color: var(--bg);
  background-image:
    linear-gradient(var(--line-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--line-soft) 1px, transparent 1px);
  background-size: 32px 32px;
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--trace-teal);
}

button {
  font-family: inherit;
}

::selection {
  background: var(--copper);
  color: var(--bg);
}

/* Focus visibility — never remove this */
:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ---------------------------------------------------------------------- */
/* Shell                                                                   */
/* ---------------------------------------------------------------------- */

.shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 24px 96px;
}

.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 28px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.header__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
  margin: 0;
}

.header__tag {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
  margin: 0;
}

.header__badge {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--trace-teal);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: var(--radius);
  white-space: nowrap;
}

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 32px;
  align-items: start;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* ---------------------------------------------------------------------- */
/* Section heading — used sparingly for top-level blocks only, styled     */
/* after real datasheet section headers, not a decorative eyebrow.        */
/* ---------------------------------------------------------------------- */

.section {
  margin-top: 40px;
}

.section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.section__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin: 0;
}

.section__meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
}

/* ---------------------------------------------------------------------- */
/* Form                                                                    */
/* ---------------------------------------------------------------------- */

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.form {
  max-width: var(--max-form);
  padding: 28px;
}

.field {
  margin-bottom: 22px;
}

.field:last-child {
  margin-bottom: 0;
}

.field__label {
  display: block;
  font-size: 13px;
  color: var(--ink-dim);
  margin-bottom: 8px;
}

.field__hint {
  font-size: 12px;
  color: var(--ink-faint);
  margin-top: 6px;
}

.input,
.select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 14px;
  padding: 10px 12px;
  transition: border-color 0.15s ease;
}

.input:focus,
.select:focus {
  border-color: var(--copper);
}

.input::placeholder {
  color: var(--ink-faint);
}

.list-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.list-row .input {
  flex: 1;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-faint);
  width: 38px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.icon-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.add-row-btn {
  background: transparent;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  color: var(--ink-dim);
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.add-row-btn:hover {
  border-color: var(--copper);
  color: var(--copper-bright);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.region-toggle {
  display: flex;
  gap: 8px;
}

.region-btn {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-dim);
  font-size: 13px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.region-btn:hover:not(:disabled) {
  border-color: var(--copper);
  color: var(--ink);
}

.region-btn--active {
  background: rgba(201, 125, 62, 0.12);
  border-color: var(--copper);
  color: var(--copper-bright);
  font-weight: 600;
}

@media (max-width: 560px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin-top: 6px;
}

.submit-row {
  margin-top: 28px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-primary {
  background: var(--copper);
  border: 1px solid var(--copper);
  color: #1a1108;
  font-weight: 600;
  font-size: 14px;
  padding: 11px 22px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--copper-bright);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-dim);
  font-size: 13px;
  padding: 10px 16px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--copper);
  color: var(--copper-bright);
}

/* ---------------------------------------------------------------------- */
/* Result states: empty / loading / error                                 */
/* ---------------------------------------------------------------------- */

.state-panel {
  max-width: var(--max-results);
  padding: 48px 32px;
  text-align: left;
}

.state-panel__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.state-panel__body {
  color: var(--ink-dim);
  font-size: 14px;
  max-width: 460px;
  margin: 0 0 20px;
}

.scan {
  position: relative;
  height: 2px;
  background: var(--line);
  overflow: hidden;
  margin-bottom: 18px;
  border-radius: 2px;
}

.scan::after {
  content: "";
  position: absolute;
  top: 0;
  left: -30%;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--copper-bright), transparent);
  animation: scan-move 1.4s ease-in-out infinite;
}

@keyframes scan-move {
  0% {
    left: -30%;
  }
  100% {
    left: 100%;
  }
}

.loading-log {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
}

/* ---------------------------------------------------------------------- */
/* Architecture flow                                                      */
/* ---------------------------------------------------------------------- */

.flow {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}

.flow__node {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  min-width: 200px;
  flex-shrink: 0;
}

.flow__node-name {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 6px;
}

.flow__node-purpose {
  font-size: 12.5px;
  color: var(--ink-dim);
  margin: 0 0 8px;
}

.flow__node-io {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
}

.flow__connector {
  display: flex;
  align-items: center;
  padding: 0 10px;
  color: var(--line);
  flex-shrink: 0;
}

/* ---------------------------------------------------------------------- */
/* Table (BOM)                                                             */
/* ---------------------------------------------------------------------- */

.table-wrap {
  overflow-x: auto;
}

table.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.data-table th {
  text-align: left;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-faint);
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table .mono {
  font-family: var(--font-mono);
}

.data-table .num {
  text-align: right;
  font-family: var(--font-mono);
}

.status-pill {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius);
  white-space: nowrap;
  display: inline-block;
}

.status-pill--ok {
  color: var(--ok);
  border: 1px solid var(--ok);
}

.status-pill--warn {
  color: var(--danger);
  border: 1px solid var(--danger);
}

.bom-total {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 12px 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink-dim);
}

.bom-total strong {
  color: var(--copper-bright);
  font-size: 15px;
}

/* ---------------------------------------------------------------------- */
/* Compatibility list                                                     */
/* ---------------------------------------------------------------------- */

.compat-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}

.compat-item:last-child {
  border-bottom: none;
}

.compat-mark {
  font-family: var(--font-mono);
  font-size: 14px;
  width: 18px;
  flex-shrink: 0;
  padding-top: 1px;
}

.compat-mark--ok {
  color: var(--ok);
}

.compat-mark--bad {
  color: var(--danger);
}

.compat-pair {
  font-family: var(--font-mono);
  font-size: 13px;
  margin: 0 0 4px;
}

.compat-reason {
  font-size: 13px;
  color: var(--ink-dim);
  margin: 0;
}

/* ---------------------------------------------------------------------- */
/* Milestones (timeline)                                                  */
/* ---------------------------------------------------------------------- */

.timeline-row {
  display: grid;
  grid-template-columns: 200px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
}

.timeline-row:last-child {
  border-bottom: none;
}

.timeline-row__name {
  font-size: 13.5px;
}

.timeline-row__deps {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  display: block;
  margin-top: 2px;
}

.timeline-bar-track {
  height: 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 2px;
  overflow: hidden;
}

.timeline-bar-fill {
  height: 100%;
  background: var(--copper);
}

.timeline-row__days {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-dim);
  white-space: nowrap;
}

/* ---------------------------------------------------------------------- */
/* Risks                                                                   */
/* ---------------------------------------------------------------------- */

.risk-item {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line-soft);
  border-left: 3px solid var(--line);
  padding-left: 14px;
}

.risk-item--high {
  border-left-color: var(--danger);
}

.risk-item--medium {
  border-left-color: var(--warn);
}

.risk-item--low {
  border-left-color: var(--trace-teal);
}

.risk-item:last-child {
  border-bottom: none;
}

.risk-item__score {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
  width: 30px;
  flex-shrink: 0;
  text-align: center;
}

.risk-item__category {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0 0 4px;
}

.risk-item__desc {
  font-size: 13.5px;
  margin: 0 0 6px;
}

.risk-item__mitigation {
  font-size: 12.5px;
  color: var(--ink-dim);
  margin: 0;
}

.risk-item__mitigation::before {
  content: "Mitigation: ";
  color: var(--ink-faint);
}

/* ---------------------------------------------------------------------- */
/* Simple lists (tests, assumptions)                                      */
/* ---------------------------------------------------------------------- */

.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.simple-list li {
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 13.5px;
}

.simple-list li:last-child {
  border-bottom: none;
}

.simple-list .label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--copper-bright);
  display: block;
  margin-bottom: 3px;
}

.simple-list .sub {
  color: var(--ink-dim);
  display: block;
  margin-top: 2px;
  font-size: 12.5px;
}

/* ---------------------------------------------------------------------- */
/* Warnings banner                                                        */
/* ---------------------------------------------------------------------- */

.warnings {
  background: rgba(224, 169, 75, 0.08);
  border: 1px solid var(--warn);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 8px;
}

.warnings__title {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--warn);
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.warnings ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--ink-dim);
}
FILE_EOF_8

cat > tests/unit/live-pricing.test.ts << 'FILE_EOF_9'
import { describe, expect, it } from "vitest";
import { extractBestMatch, usdToApproxEgp, EGP_TO_USD_FALLBACK_RATE } from "@/lib/robopilot/live-pricing";

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
FILE_EOF_9

cat > tests/api/robopilot.test.ts << 'FILE_EOF_10'
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/robopilot", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

const validPayload = {
  projectName: "Line-following rover",
  requirements: ["Detect obstacles within 30cm", "Follow a black line on a white floor"],
  constraints: ["Budget under $80"],
  budgetUsd: 80,
  targetPlatform: "esp32",
};

describe("POST /api/robopilot", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ROBOPILOT_STUB_MODE = "true";
    process.env.ROBOPILOT_LIVE_PRICING = "false";
  });

  afterEach(() => {
    delete process.env.ROBOPILOT_STUB_MODE;
    delete process.env.ROBOPILOT_LIVE_PRICING;
  });

  it("returns a valid, schema-conforming plan for a well-formed request", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify(validPayload)));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.meta.provider_used).toBe("stub");
    expect(Array.isArray(json.components)).toBe(true);
    expect(Array.isArray(json.compatibility_checks)).toBe(true);
    expect(Array.isArray(json.milestones)).toBe(true);
    expect(Array.isArray(json.risks)).toBe(true);
    expect(Array.isArray(json.tests)).toBe(true);
    expect(typeof json.bom_total_usd).toBe("number");
  });

  it("rejects a request with no requirements (empty array)", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(
      makeRequest(JSON.stringify({ projectName: "Empty", requirements: [], constraints: [] }))
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("rejects a request missing required fields", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify({ requirements: ["only this"] })));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest("{not valid json"));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized request body", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const oversized = JSON.stringify({
      projectName: "Big",
      requirements: ["x".repeat(25_000)],
      constraints: [],
    });
    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(413);
  });

  it("rejects the GET method", async () => {
    const { GET } = await import("@/app/api/robopilot/route");
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

describe("POST /api/robopilot — provider failure path", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ROBOPILOT_STUB_MODE;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("returns a safe 502 (never a stack trace or secret) when both providers are unavailable", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify(validPayload)));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("PROVIDER_UNAVAILABLE");
    expect(json.error).not.toMatch(/GROQ_API_KEY|GEMINI_API_KEY/);
  });
});
FILE_EOF_10

cat > .env.example << 'FILE_EOF_11'
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
FILE_EOF_11

echo "All files updated. Run: npm run typecheck && npm test (expect 39 passed)"