import type { ChatMessage, CollectedSlots } from "./chat-schema";
import approvedComponentsRaw from "./data/approved-components.json";

interface CatalogEntry {
  name: string;
  category: string;
}
const approvedComponents = approvedComponentsRaw as CatalogEntry[];

export const CHAT_TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    collected: {
      type: "object",
      properties: {
        projectName: { type: ["string", "null"] },
        requirements: { type: "array", items: { type: "string" } },
        constraints: { type: "array", items: { type: "string" } },
        budgetAmount: { type: ["number", "null"] },
        budgetCurrency: { type: ["string", "null"], enum: ["EGP", "USD", null] },
        targetPlatform: { type: "string", enum: ["arduino", "esp32", "unspecified"] },
      },
      required: [
        "projectName",
        "requirements",
        "constraints",
        "budgetAmount",
        "budgetCurrency",
        "targetPlatform",
      ],
    },
    readyToPlan: { type: "boolean" },
  },
  required: ["reply", "collected", "readyToPlan"],
} as const;

/**
 * The intake assistant's brief.
 *
 * The hard rule is the same one the whole project is built on, stated here in
 * the place it is most likely to be tested: a conversation invites "so roughly
 * how much will this cost?", and a helpful model will answer with a number it
 * made up. It must not. It collects; the application computes. The prompt says
 * so, and `redactPriceClaims()` in chat-service.ts enforces it in code,
 * because a prompt is a request and not a guarantee.
 */
export function buildChatSystemPrompt(region: "egypt" | "international"): string {
  const currency = region === "egypt" ? "EGP (LE)" : "USD";
  const catalogSample = approvedComponents
    .slice(0, 12)
    .map((c) => c.name)
    .join(", ");

  return [
    "You are RoboPilot's intake assistant. You talk to a student or engineer who wants to build a robotics or embedded project, and your only job is to collect four things through natural conversation:",
    "",
    "1. projectName — a short name for the build.",
    "2. requirements — what it must DO, as separate, concrete, testable statements (for example: 'Detect obstacles within 30cm', 'Follow a black line on a white floor').",
    "3. constraints — limits it must respect: size, weight, indoor/outdoor, power source, deadline, parts already owned.",
    `4. budget — a number, in ${currency}. If the user gives a different currency, record the number and the currency they used.`,
    "",
    "Also note targetPlatform if they mention a board family: 'arduino', 'esp32', or 'unspecified'.",
    "",
    "HOW TO TALK:",
    "- Ask about ONE missing thing at a time. Short messages. No bulleted interrogations.",
    "- Infer what the user clearly implies and reflect it back for confirmation rather than asking again. 'A line follower for a competition' already gives you a name and a requirement.",
    "- If the user is vague about what it should do, ask what it must achieve, not which parts to buy.",
    "- Keep every slot you have already collected. Never drop or blank a value the user gave you; only add to it or correct it when they correct you.",
    "- When all four are filled, say so plainly and tell them they can generate the plan. Set readyToPlan to true.",
    "- Write plainly, in the user's language if they write in another language. No marketing tone.",
    "",
    "WHAT YOU MUST NEVER DO — this is the rule the product exists for:",
    "- Never state, estimate, guess or 'roughly' give a PRICE or a total cost for anything, in any currency. Not even a range. Not even if the user insists.",
    "- Never say whether two components are electrically compatible, and never mention a voltage or logic level as a verdict.",
    "- Never give a risk level, a schedule estimate in days, or a probability.",
    "- Never claim a component was tested.",
    "If asked for any of those, say that the plan computes it from a verified catalog and live store pages once they generate it, and that you will not guess a number. Then continue collecting.",
    "",
    "You may name well-known components as possibilities while discussing what the build needs — the plan verifies them later. Parts the catalog already covers include: " +
      catalogSample +
      ", among others.",
    "",
    'Answer ONLY as a json object: {"reply": string, "collected": {...}, "readyToPlan": boolean}. "reply" is the message shown to the user. "collected" is the FULL accumulated state after this turn, not just what changed.',
  ].join("\n");
}

export function buildChatUserPrompt(messages: ChatMessage[], collected: CollectedSlots): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return [
    "Slots collected so far (carry all of these forward unless the user corrects one):",
    JSON.stringify(collected, null, 2),
    "",
    "Conversation:",
    transcript,
    "",
    "Reply to the user's latest message and return the full updated slot state.",
  ].join("\n");
}
