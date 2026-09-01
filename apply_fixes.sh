cat > src/lib/robopilot/data/approved-components.json << 'FILE_EOF_1'
[
  {
    "name": "Arduino Nano",
    "aliases": ["Nano", "Arduino Nano V3", "ATmega328P Nano"],
    "category": "microcontroller",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 25.0,
    "datasheetUrl": "https://docs.arduino.cc/hardware/nano/"
  },
  {
    "name": "Arduino Uno R3",
    "aliases": ["Arduino Uno", "Uno R3", "ATmega328P Uno"],
    "category": "microcontroller",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 23.0,
    "datasheetUrl": "https://docs.arduino.cc/hardware/uno-rev3/"
  },
  {
    "name": "ESP32-WROOM-32 DevKit",
    "aliases": ["ESP32 DevKit", "ESP32-WROOM-32", "ESP32 Dev Board"],
    "category": "microcontroller",
    "operatingVoltageV": [3.3, 3.3],
    "logicLevelV": [3.3],
    "interface": "GPIO",
    "unitPriceUsd": 9.5,
    "datasheetUrl": "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/hw-reference/esp32/get-started-devkitc.html"
  },
  {
    "name": "HC-SR04",
    "aliases": ["HC-SR04 Ultrasonic", "Ultrasonic Distance Sensor"],
    "category": "sensor",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 3.5,
    "datasheetUrl": "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf"
  },
  {
    "name": "VL53L0X",
    "aliases": ["VL53L0X ToF", "Time-of-Flight Distance Sensor"],
    "category": "sensor",
    "operatingVoltageV": [2.6, 3.5],
    "logicLevelV": [3.3],
    "interface": "I2C",
    "unitPriceUsd": 6.0,
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/vl53l0x.pdf"
  },
  {
    "name": "MPU6050",
    "aliases": ["MPU-6050", "6-axis IMU"],
    "category": "sensor",
    "operatingVoltageV": [2.375, 3.46],
    "logicLevelV": [3.3],
    "interface": "I2C",
    "unitPriceUsd": 2.5,
    "datasheetUrl": "https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf"
  },
  {
    "name": "DHT22",
    "aliases": ["AM2302", "Temperature Humidity Sensor"],
    "category": "sensor",
    "operatingVoltageV": [3.3, 6],
    "logicLevelV": [3.3, 5],
    "interface": "GPIO",
    "unitPriceUsd": 5.0,
    "datasheetUrl": "https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf"
  },
  {
    "name": "NEO-6M GPS Module",
    "aliases": ["NEO-6M", "GPS Module"],
    "category": "sensor",
    "operatingVoltageV": [2.7, 3.6],
    "logicLevelV": [3.3, 5],
    "interface": "UART",
    "unitPriceUsd": 8.0,
    "datasheetUrl": "https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_%28GPS.G6-HW-09005%29.pdf"
  },
  {
    "name": "L298N",
    "aliases": ["L298N Motor Driver", "Dual H-Bridge Driver"],
    "category": "actuator_driver",
    "operatingVoltageV": [5, 35],
    "logicLevelV": [5],
    "interface": "PWM",
    "unitPriceUsd": 4.5,
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/l298.pdf"
  },
  {
    "name": "MG996R",
    "aliases": ["MG996R Servo", "Servo Motor"],
    "category": "actuator",
    "operatingVoltageV": [4.8, 7.2],
    "logicLevelV": [3.3, 5],
    "interface": "PWM",
    "unitPriceUsd": 6.5,
    "datasheetUrl": "https://www.electronicoscaldas.com/datasheet/MG996R.pdf"
  },
  {
    "name": "SG90",
    "aliases": ["SG90 Servo", "Micro Servo"],
    "category": "actuator",
    "operatingVoltageV": [4.8, 6],
    "logicLevelV": [3.3, 5],
    "interface": "PWM",
    "unitPriceUsd": 2.0,
    "datasheetUrl": "https://www.friendlywire.com/projects/rc-lawn-mower-1/SG90-datasheet.pdf"
  },
  {
    "name": "18650 Li-ion Battery + Holder",
    "aliases": ["18650 Battery", "Li-ion Battery Pack"],
    "category": "power",
    "operatingVoltageV": [3.0, 4.2],
    "logicLevelV": [3.3, 5],
    "interface": "GPIO",
    "unitPriceUsd": 7.0,
    "datasheetUrl": "https://docs.arduino.cc/learn/electronics/power-supplies/"
  },
  {
    "name": "Raspberry Pi Pico W",
    "aliases": ["Pico W", "RP2040 Pico W"],
    "category": "microcontroller",
    "operatingVoltageV": [3.3, 3.3],
    "logicLevelV": [3.3],
    "interface": "GPIO",
    "unitPriceUsd": 6.0,
    "datasheetUrl": "https://datasheets.raspberrypi.com/picow/pico-w-datasheet.pdf"
  }
]
FILE_EOF_1

cat > src/lib/robopilot/tools.ts << 'FILE_EOF_2'
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
FILE_EOF_2

cat > src/lib/robopilot/service.ts << 'FILE_EOF_3'
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
    totalComponentCount: selections.length,
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
FILE_EOF_3

cat > src/lib/robopilot/prompt.ts << 'FILE_EOF_4'
import type { RequirementInput } from "./schema";
import approvedComponentsRaw from "./data/approved-components.json";

interface CatalogEntry {
  name: string;
  category: string;
  interface: string;
}

const approvedComponents = approvedComponentsRaw as CatalogEntry[];

/**
 * A short, human-readable listing of the approved catalog, injected into the
 * prompt so the model proposes components that will actually resolve in
 * estimate_bom()/check_compatibility() instead of inventing plausible-sounding
 * names that only partially match. This is the grounding step: the model
 * chooses from known-good options rather than us matching after the fact.
 */
function buildCatalogListing(): string {
  return approvedComponents
    .map((c) => `- ${c.name} (${c.category}, ${c.interface})`)
    .join("\n");
}

/**
 * The model is deliberately asked for the SMALLEST possible surface:
 * architecture blocks + candidate components + assumptions. It never
 * computes price, compatibility, milestones or risk — see tools.ts.
 * All properties are required (Groq strict mode does not support optional
 * fields), so keep this in sync with AIDecompositionSchema in schema.ts.
 */
export const AI_DECOMPOSITION_JSON_SCHEMA = {
  type: "object",
  properties: {
    architecture_blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
          inputs: { type: "array", items: { type: "string" } },
          outputs: { type: "array", items: { type: "string" } },
        },
        required: ["name", "purpose", "inputs", "outputs"],
      },
    },
    proposed_components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          candidateName: { type: "string" },
          quantity: { type: "integer" },
          justification: { type: "string" },
        },
        required: ["role", "candidateName", "quantity", "justification"],
      },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          reason: { type: "string" },
        },
        required: ["statement", "reason"],
      },
    },
  },
  required: ["architecture_blocks", "proposed_components", "assumptions"],
} as const;

export function buildSystemPrompt(): string {
  return [
    "You are a robotics systems-decomposition assistant for RoboPilot, a student engineering copilot.",
    "Your ONLY job is to decompose requirements into architecture blocks and propose candidate components with a short justification.",
    "You do NOT calculate prices, compatibility, or risk — those are computed deterministically by the application, never by you.",
    "",
    "APPROVED COMPONENT CATALOG — prefer these exact names verbatim in candidateName whenever one of them fits the role:",
    buildCatalogListing(),
    "",
    "If none of the approved parts fit a required role, you may propose a different well-known, commercially available part — the application will mark it 'not_in_catalog' and flag it for the team to review manually. Never invent a datasheet URL or a price either way.",
    "If a requirement is ambiguous, unsafe, or implies safety-critical or mains-voltage work, record it as an assumption/limitation instead of inventing a design around it.",
    "Never claim a component was physically tested.",
  ].join("\n");
}

export function buildUserPrompt(input: RequirementInput): string {
  const requirements = input.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const constraints = input.constraints.length
    ? input.constraints.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(none stated)";

  return [
    `Project: ${input.projectName}`,
    `Target platform preference: ${input.targetPlatform}`,
    "",
    "Requirements:",
    requirements,
    "",
    "Constraints:",
    constraints,
    "",
    "Decompose this into architecture blocks and propose candidate components for each role.",
    "Keep the design to the smallest set of components that satisfies the stated requirements.",
  ].join("\n");
}
FILE_EOF_4

cat > tests/unit/tools.test.ts << 'FILE_EOF_5'
import { describe, expect, it } from "vitest";
import { check_compatibility, estimate_bom, project_risk } from "@/lib/robopilot/tools";

describe("estimate_bom", () => {
  it("computes a correct total for approved components", () => {
    const result = estimate_bom([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "HC-SR04", quantity: 2 },
    ]);
    expect(result.unresolvedCount).toBe(0);
    expect(result.lines).toHaveLength(2);
    // 9.5 * 1 + 3.5 * 2 = 16.5
    expect(result.totalUsd).toBe(16.5);
  });

  it("matches components by alias, case-insensitively", () => {
    const result = estimate_bom([
      { role: "sensor", candidateName: "ultrasonic distance sensor", quantity: 1 },
    ]);
    const [line] = result.lines;
    expect(line?.status).toBe("approved");
    expect(line?.name).toBe("HC-SR04");
  });

  it("flags an unknown component instead of guessing a price", () => {
    const result = estimate_bom([
      { role: "sensor", candidateName: "Definitely Not A Real Sensor 9000", quantity: 1 },
    ]);
    const [line] = result.lines;
    expect(result.unresolvedCount).toBe(1);
    expect(line?.status).toBe("not_in_catalog");
    expect(line?.unitPriceUsd).toBe(0);
    expect(result.totalUsd).toBe(0);
  });

  it("is deterministic: same input always produces the same output", () => {
    const input = [{ role: "sensor", candidateName: "MPU6050", quantity: 3 }];
    expect(estimate_bom(input)).toEqual(estimate_bom(input));
  });

  // --- Fuzzy fallback matching, added after real Groq output showed the AI ---
  // --- naturally phrases names with extra description text.               ---
  describe("fuzzy fallback matching (real-world AI phrasing)", () => {
    it("resolves a catalog name embedded in a longer AI-generated description", () => {
      const result = estimate_bom([
        {
          role: "environmental sensor",
          candidateName: "DHT22 (AM2302) temperature/humidity sensor",
          quantity: 1,
        },
      ]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("DHT22");
    });

    it("resolves a catalog alias with a vendor prefix added", () => {
      const result = estimate_bom([
        { role: "gps module", candidateName: "u-blox NEO-6M GPS module", quantity: 1 },
      ]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("NEO-6M GPS Module");
    });

    it("resolves a catalog name with a descriptive suffix added", () => {
      const result = estimate_bom([{ role: "actuator", candidateName: "SG90 micro servo", quantity: 1 }]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("SG90");
    });

    it("still refuses to match a genuinely different component", () => {
      const result = estimate_bom([{ role: "microcontroller", candidateName: "Raspberry Pi 4B", quantity: 1 }]);
      expect(result.lines[0]?.status).toBe("not_in_catalog");
    });
  });
});

describe("check_compatibility", () => {
  it("flags a logic-level mismatch between a 5V sensor and a 3.3V-only MCU", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "HC-SR04", quantity: 1 },
    ]);
    const pair = results.find((r) => r.componentB === "HC-SR04");
    expect(pair).toBeDefined();
    expect(pair!.compatible).toBe(false);
  });

  it("confirms compatibility when logic levels overlap", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "VL53L0X", quantity: 1 },
    ]);
    const pair = results.find((r) => r.componentB === "VL53L0X");
    expect(pair?.compatible).toBe(true);
  });

  it("returns no results when no microcontroller is selected", () => {
    const results = check_compatibility([{ role: "sensor", candidateName: "HC-SR04", quantity: 1 }]);
    expect(results).toHaveLength(0);
  });

  it("silently skips components that are not in the catalog (estimate_bom already flags them)", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "Unknown Sensor XYZ", quantity: 1 },
    ]);
    expect(results).toHaveLength(0);
  });

  it("recognizes Arduino Nano as a valid microcontroller for compatibility checks", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "Arduino Nano", quantity: 1 },
      { role: "sensor", candidateName: "DHT22", quantity: 1 },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.compatible).toBe(true);
  });
});

describe("project_risk", () => {
  const oneMilestone = [{ name: "M1", description: "d", dependsOn: [], estimatedDays: 3 }];

  it("raises budget risk when the BOM total exceeds the stated budget", () => {
    const risks = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      budgetUsd: 20,
      bomTotalUsd: 50,
    });
    const budgetRisk = risks.find((r) => r.category === "budget");
    expect(budgetRisk).toBeDefined();
    expect(budgetRisk!.likelihood).not.toBe("low");
  });

  it("does not raise a budget risk when no budget was stated", () => {
    const risks = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 50,
    });
    expect(risks.find((r) => r.category === "budget")).toBeUndefined();
  });

  // --- The bug real testing surfaced: a BOM total of $0 from unresolved   ---
  // --- components must never read as "safely under budget".              ---
  describe("budget risk vs. unresolved components", () => {
    it("never reports 'low risk, no action needed' when every component is unresolved", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 3,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 0,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk).toBeDefined();
      expect(budgetRisk!.likelihood).not.toBe("low");
      expect(budgetRisk!.description).toMatch(/cannot be assessed/i);
      expect(budgetRisk!.mitigation).not.toMatch(/no action needed/i);
    });

    it("flags the caveat, and avoids 'low' likelihood, when some (not all) components are unresolved", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 1,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 10,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk).toBeDefined();
      expect(budgetRisk!.likelihood).not.toBe("low");
      expect(budgetRisk!.description).toMatch(/unpriced/i);
    });

    it("still reports low risk normally when every component resolved and total is well under budget", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 0,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 10,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk!.likelihood).toBe("low");
      expect(budgetRisk!.mitigation).toMatch(/no action needed/i);
    });
  });

  it("raises component_availability risk only when something is unresolved", () => {
    const withUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 2,
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 10,
    });
    expect(withUnresolved.find((r) => r.category === "component_availability")).toBeDefined();

    const withoutUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 10,
    });
    expect(withoutUnresolved.find((r) => r.category === "component_availability")).toBeUndefined();
  });

  it("computes a deeper schedule risk for longer dependency chains", () => {
    const chain = [
      { name: "A", description: "d", dependsOn: [], estimatedDays: 3 },
      { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 3 },
      { name: "C", description: "d", dependsOn: ["B"], estimatedDays: 3 },
      { name: "D", description: "d", dependsOn: ["C"], estimatedDays: 3 },
    ];
    const risks = project_risk(chain, {
      unresolvedComponentCount: 0,
      totalComponentCount: 4,
      incompatiblePairCount: 0,
      totalEstimatedDays: 12,
      bomTotalUsd: 10,
    });
    const scheduleRisk = risks.find((r) => r.category === "schedule");
    expect(scheduleRisk!.likelihood).toBe("high");
  });

  it("guards against circular dependencies instead of infinite-looping", () => {
    const circular = [
      { name: "A", description: "d", dependsOn: ["B"], estimatedDays: 1 },
      { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 1 },
    ];
    expect(() =>
      project_risk(circular, {
        unresolvedComponentCount: 0,
        totalComponentCount: 2,
        incompatiblePairCount: 0,
        totalEstimatedDays: 2,
        bomTotalUsd: 5,
      })
    ).not.toThrow();
  });

  it("sorts risks by descending score", () => {
    const risks = project_risk(
      [
        { name: "A", description: "d", dependsOn: [], estimatedDays: 3 },
        { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 3 },
        { name: "C", description: "d", dependsOn: ["B"], estimatedDays: 3 },
        { name: "D", description: "d", dependsOn: ["C"], estimatedDays: 3 },
      ],
      {
        unresolvedComponentCount: 4,
        totalComponentCount: 4,
        incompatiblePairCount: 3,
        totalEstimatedDays: 40,
        bomTotalUsd: 10,
      }
    );
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1]?.score).toBeGreaterThanOrEqual(risks[i]?.score ?? 0);
    }
  });
});
FILE_EOF_5
