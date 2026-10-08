import { generateStructured, ProviderError } from "../ai/providers";
import { CHAT_TURN_JSON_SCHEMA, buildChatSystemPrompt, buildChatUserPrompt } from "./chat-prompt";
import {
  ChatRequest,
  ChatResponse,
  ChatResponseSchema,
  ChatTurnSchema,
  CollectedSlotsSchema,
  EMPTY_SLOTS,
  type CollectedSlots,
} from "./chat-schema";
import { EGP_TO_USD_FALLBACK_RATE } from "./fx";
import { ServiceError } from "./service";
import type { RequirementInput } from "./schema";

const isStubMode = () => process.env.ROBOPILOT_STUB_MODE === "true";

export type MissingSlot = "projectName" | "requirements" | "constraints" | "budget";

/* ---------------------------------------------------------------------- */
/* The guarantee, in code rather than in a prompt                         */
/* ---------------------------------------------------------------------- */

/**
 * Three shapes, kept separate on purpose.
 *
 * The Arabic and Franco alternatives are not decoration: this product is used
 * in Egypt, users write in Arabic and in transliterated Arabic, and the model
 * answers in the language it is addressed in. A guard that only catches "$45"
 * would wave through "حوالي 1500 جنيه". Note also that \b is ASCII-only in
 * JavaScript, so it cannot be used to close an Arabic alternative — that was
 * the first version of this and it silently matched nothing.
 */
const PRICE_SHAPED = new RegExp(
  [
    // a currency symbol followed by a figure: $45, £1,200, €30.50
    String.raw`[$£€]\s?\d`,
    // a figure followed by an ASCII currency word: 2500 EGP, 80 USD, 30 dollars
    String.raw`\b\d[\d,]*(?:\.\d{1,2})?\s?(?:EGP|LE|USD|pounds?|dollars?|geneh|gneh|guinea)\b`,
    // an ASCII currency word followed by a figure: EGP 2500, LE 1,800
    String.raw`\b(?:EGP|LE|USD)\s?\d`,
    // the same in Arabic, where \b does not apply: ١٥٠٠ جنيه / 1500 جنيه
    String.raw`[\d٠-٩][\d٠-٩,.]*\s?(?:جنيه|دولار|يورو)`,
    String.raw`(?:جنيه|دولار|يورو)\s?[\d٠-٩]`,
  ].join("|"),
  "i"
);

export const PRICE_REFUSAL =
  "I can't put a number on cost — I'd only be guessing, and that's exactly what this tool refuses to do. " +
  "Prices come from the verified catalog and live store pages when you generate the plan. Let's keep going with the build itself.";

/**
 * Removes price-shaped claims from a conversational reply.
 *
 * The system prompt forbids quoting prices. A prompt is a request, and this
 * is the one rule the project cannot afford to lose: every number in a plan
 * is traceable to the catalog or to a store page that was actually fetched.
 * A chat window is where that rule gets tested, because "so about how much
 * will this cost?" is the most natural question a user can ask and the most
 * natural thing for a model to answer.
 *
 * So the reply is checked here. If it contains something shaped like money,
 * the whole reply is replaced — not patched — because a sentence built around
 * a figure stops making sense once the figure is cut out of it, and a
 * half-redacted sentence reads like a glitch rather than a boundary.
 *
 * Rejecting a harmless sentence costs the user one slightly stiff reply.
 * Letting an invented price through costs the thing the product is for.
 */
export function redactPriceClaims(reply: string): { reply: string; redacted: boolean } {
  if (PRICE_SHAPED.test(reply)) {
    return { reply: PRICE_REFUSAL, redacted: true };
  }
  return { reply, redacted: false };
}

/* ---------------------------------------------------------------------- */
/* Readiness is ours to decide, not the model's                           */
/* ---------------------------------------------------------------------- */

/**
 * The model reports `readyToPlan`, and that value is ignored for anything
 * that matters. Readiness is recomputed from the slots themselves, so an
 * over-eager model cannot push a half-filled form into the planner — the
 * planner would then either reject it or, worse, plan from a brief nobody
 * actually gave.
 */
export function missingSlots(slots: CollectedSlots): MissingSlot[] {
  const missing: MissingSlot[] = [];
  if (!slots.projectName || slots.projectName.trim().length < 3) missing.push("projectName");
  if (slots.requirements.filter((r) => r.trim().length >= 3).length === 0) missing.push("requirements");
  if (slots.constraints.filter((c) => c.trim().length >= 3).length === 0) missing.push("constraints");
  if (slots.budgetAmount === null || !(slots.budgetAmount > 0)) missing.push("budget");
  return missing;
}

/**
 * Slots only ever grow. A model that forgets a requirement it was told three
 * turns ago must not be able to delete it from the user's form — so the
 * previous state is merged over the new one for anything the model dropped.
 */
export function mergeSlots(previous: CollectedSlots, incoming: CollectedSlots): CollectedSlots {
  const union = (a: string[], b: string[]) => {
    const seen = new Set<string>();
    return [...a, ...b]
      .map((s) => s.trim())
      .filter((s) => {
        if (s.length < 3) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  };

  return {
    projectName: incoming.projectName?.trim() || previous.projectName,
    requirements: union(previous.requirements, incoming.requirements),
    constraints: union(previous.constraints, incoming.constraints),
    budgetAmount: incoming.budgetAmount ?? previous.budgetAmount,
    budgetCurrency: incoming.budgetCurrency ?? previous.budgetCurrency,
    targetPlatform:
      incoming.targetPlatform !== "unspecified" ? incoming.targetPlatform : previous.targetPlatform,
  };
}

/**
 * Turns finished slots into the exact same input the form submits. The budget
 * is converted to USD here for the same reason IntakeForm does it: the API
 * field is always USD, and the conversion belongs at the boundary rather than
 * inside the planner.
 */
export function slotsToPlanInput(
  slots: CollectedSlots,
  priceRegion: "egypt" | "international"
): RequirementInput {
  const budgetUsd =
    slots.budgetAmount === null
      ? undefined
      : slots.budgetCurrency === "EGP"
        ? Math.round(slots.budgetAmount * EGP_TO_USD_FALLBACK_RATE * 100) / 100
        : slots.budgetAmount;

  return {
    projectName: (slots.projectName ?? "Untitled project").trim().slice(0, 120),
    requirements: slots.requirements.filter((r) => r.trim().length >= 3).slice(0, 20),
    constraints: slots.constraints.filter((c) => c.trim().length >= 3).slice(0, 20),
    budgetUsd,
    targetPlatform: slots.targetPlatform,
    priceRegion,
  };
}

/* ---------------------------------------------------------------------- */
/* Stub mode — a scripted intake, so the UI and CI need no provider       */
/* ---------------------------------------------------------------------- */

function buildStubTurn(slots: CollectedSlots, lastUserMessage: string) {
  const next = { ...slots };
  const text = lastUserMessage.trim();

  if (!next.projectName) {
    next.projectName = text.slice(0, 60) || "Stub project";
  } else if (next.requirements.length === 0) {
    next.requirements = [text.slice(0, 200)];
  } else if (next.constraints.length === 0) {
    next.constraints = [text.slice(0, 200)];
  } else if (next.budgetAmount === null) {
    const n = Number(text.replace(/[^\d.]/g, ""));
    next.budgetAmount = Number.isFinite(n) && n > 0 ? n : 1000;
    next.budgetCurrency = "EGP";
  }

  const stillMissing = missingSlots(next);
  const prompts: Record<MissingSlot, string> = {
    projectName: "What are you calling this build?",
    requirements: "What does it have to do? One behaviour at a time is fine.",
    constraints: "Anything it has to work within — size, power, a deadline, parts you already own?",
    budget: "What's your budget for parts?",
  };

  return {
    reply:
      stillMissing.length === 0
        ? "That's everything I need. Generate the plan whenever you're ready. (Stub mode — no AI provider was called.)"
        : prompts[stillMissing[0]!],
    collected: next,
    readyToPlan: stillMissing.length === 0,
  };
}

/* ---------------------------------------------------------------------- */
/* Entry point                                                             */
/* ---------------------------------------------------------------------- */

export async function runChatTurn(input: ChatRequest): Promise<ChatResponse> {
  const previous = input.collected ?? EMPTY_SLOTS;
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    throw new ServiceError("The conversation must end with a user message.", 400, "NO_USER_MESSAGE");
  }

  let providerUsed: "groq" | "gemini" | "stub";
  let turn: { reply: string; collected: CollectedSlots; readyToPlan: boolean };

  if (isStubMode()) {
    turn = buildStubTurn(previous, lastUser.content);
    providerUsed = "stub";
  } else {
    let raw: unknown;
    try {
      const result = await generateStructured({
        systemPrompt: buildChatSystemPrompt(input.priceRegion),
        userPrompt: buildChatUserPrompt(input.messages, previous),
        jsonSchema: CHAT_TURN_JSON_SCHEMA,
        schemaName: "robopilot_chat_turn",
      });
      raw = result.data;
      providerUsed = result.providerUsed;
    } catch (err) {
      if (err instanceof ProviderError) {
        throw new ServiceError(
          "The assistant is temporarily unavailable. You can still fill the form directly.",
          502,
          "PROVIDER_UNAVAILABLE"
        );
      }
      throw err;
    }

    const parsed = ChatTurnSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ServiceError(
        "The assistant's response did not match the required schema.",
        502,
        "AI_SCHEMA_MISMATCH"
      );
    }
    turn = parsed.data;
  }

  const collected = mergeSlots(previous, CollectedSlotsSchema.parse(turn.collected));
  const { reply, redacted } = redactPriceClaims(turn.reply);
  const missing = missingSlots(collected);

  const response: ChatResponse = {
    reply,
    collected,
    missing,
    // The model's own readyToPlan is deliberately not consulted.
    ready: missing.length === 0,
    meta: { provider_used: providerUsed, priceClaimRedacted: redacted },
  };

  const validated = ChatResponseSchema.safeParse(response);
  if (!validated.success) {
    throw new ServiceError("Failed to assemble a valid reply.", 500, "CHAT_ASSEMBLY_FAILED");
  }
  return validated.data;
}
