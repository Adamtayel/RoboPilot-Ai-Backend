import { generateStructured, ProviderError } from "../ai/providers";
import { AI_DECOMPOSITION_JSON_SCHEMA, buildSystemPrompt, buildUserPrompt } from "./prompt";
import {
  AIDecompositionSchema,
  RequirementInput,
  RoboPilotPlan,
  RoboPilotPlanSchema,
  type Assumption,
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

  const compatibility = check_compatibility(selections);
  const incompatibleCount = compatibility.filter((c) => !c.compatible).length;
  if (incompatibleCount > 0) {
    warnings.push(`${incompatibleCount} component pair(s) failed the logic-level compatibility check.`);
  }

  const milestones = buildMilestones(decomposition.architecture_blocks);
  const totalEstimatedDays = milestones.reduce((sum, m) => sum + m.estimatedDays, 0);

  const risks = project_risk(milestones, {
    unresolvedComponentCount: bom.unresolvedCount,
    incompatiblePairCount: incompatibleCount,
    totalEstimatedDays,
    budgetUsd: input.budgetUsd,
    bomTotalUsd: bom.totalUsd,
  });

  const tests = buildTestPlan(decomposition.architecture_blocks, selections);

  const plan: RoboPilotPlan = {
    requirements: input.requirements,
    constraints: input.constraints,
    architecture_blocks: decomposition.architecture_blocks,
    components: bom.lines,
    compatibility_checks: compatibility,
    bom_items: bom.lines,
    bom_total_usd: bom.totalUsd,
    milestones,
    risks,
    tests,
    assumptions: decomposition.assumptions,
    meta: {
      provider_used: providerUsed,
      generated_at: new Date().toISOString(),
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
