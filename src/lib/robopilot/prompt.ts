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
