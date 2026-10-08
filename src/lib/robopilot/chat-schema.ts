import { z } from "zod";

/**
 * ============================================================================
 * CONVERSATIONAL INTAKE CONTRACT
 * ============================================================================
 *
 * The chat exists to fill in the planner's intake form by talking, instead of
 * making someone fill four fields cold. That is ALL it does.
 *
 * The model's output schema below has no price field, no compatibility field
 * and no risk field — the same deliberate omission as AIDecompositionSchema.
 * Once the four slots are filled, the collected input goes through exactly the
 * same path as the form: RequirementInputSchema -> generatePlan() -> the
 * deterministic tools. The conversation never becomes a second, softer route
 * to a number.
 */

/** The four things a plan needs from the user, as the model collects them. */
export const CollectedSlotsSchema = z.object({
  projectName: z.string().max(120).nullable(),
  requirements: z.array(z.string().max(500)).max(20),
  constraints: z.array(z.string().max(500)).max(20),
  /** Kept in the user's own currency; converted at hand-off, as the form does. */
  budgetAmount: z.number().positive().max(10_000_000).nullable(),
  budgetCurrency: z.enum(["EGP", "USD"]).nullable(),
  targetPlatform: z.enum(["arduino", "esp32", "unspecified"]),
});
export type CollectedSlots = z.infer<typeof CollectedSlotsSchema>;

export const EMPTY_SLOTS: CollectedSlots = {
  projectName: null,
  requirements: [],
  constraints: [],
  budgetAmount: null,
  budgetCurrency: null,
  targetPlatform: "unspecified",
};

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** What the client sends to POST /api/robopilot/chat */
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(40),
  collected: CollectedSlotsSchema.optional(),
  priceRegion: z.enum(["egypt", "international"]).default("egypt"),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** The ONLY shape the model is allowed to answer in. */
export const ChatTurnSchema = z.object({
  reply: z.string().min(1).max(1200),
  collected: CollectedSlotsSchema,
  /** The model's own read of whether it has enough to plan. Advisory only — */
  /** readiness is recomputed deterministically in the service.             */
  readyToPlan: z.boolean(),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

/** What the route returns to the client. */
export const ChatResponseSchema = z.object({
  reply: z.string(),
  collected: CollectedSlotsSchema,
  /** Slot names still outstanding, computed by us, not by the model. */
  missing: z.array(z.enum(["projectName", "requirements", "constraints", "budget"])),
  ready: z.boolean(),
  meta: z.object({
    provider_used: z.enum(["groq", "gemini", "stub"]),
    /** True when a price-shaped claim was removed from the model's reply. */
    priceClaimRedacted: z.boolean(),
  }),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
