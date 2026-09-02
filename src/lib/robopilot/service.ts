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
