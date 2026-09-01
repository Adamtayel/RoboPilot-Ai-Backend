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

export function findApprovedComponent(name: string): ApprovedComponent | undefined {
  const needle = name.trim().toLowerCase();
  return approvedComponents.find(
    (c) => c.name.toLowerCase() === needle || c.aliases.some((a) => a.toLowerCase() === needle)
  );
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
    const overBudget = ctx.bomTotalUsd > ctx.budgetUsd;
    const ratio = ctx.bomTotalUsd / ctx.budgetUsd;
    const likelihood: Level = !overBudget ? "low" : ratio > 1.25 ? "high" : "medium";
    const impact: Level = overBudget ? "high" : "low";
    risks.push({
      category: "budget",
      description: `Estimated BOM total is $${ctx.bomTotalUsd.toFixed(2)} against a stated budget of $${ctx.budgetUsd.toFixed(2)}.`,
      likelihood,
      impact,
      score: riskScore(likelihood, impact),
      mitigation: overBudget
        ? "Substitute lower-cost approved alternatives or reduce component quantities."
        : "No action needed; monitor for scope creep.",
    });
  }

  return risks.sort((a, b) => b.score - a.score);
}
