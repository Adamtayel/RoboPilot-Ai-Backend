import { describe, expect, it } from "vitest";
import {
  PRICE_REFUSAL,
  mergeSlots,
  missingSlots,
  redactPriceClaims,
  slotsToPlanInput,
} from "@/lib/robopilot/chat-service";
import { EMPTY_SLOTS, type CollectedSlots } from "@/lib/robopilot/chat-schema";
import { EGP_TO_USD_FALLBACK_RATE } from "@/lib/robopilot/fx";

const slots = (over: Partial<CollectedSlots> = {}): CollectedSlots => ({ ...EMPTY_SLOTS, ...over });

/* --------------------------------------------------------------------- */
/* The guarantee: a conversation cannot become a second route to a price  */
/* --------------------------------------------------------------------- */

describe("redactPriceClaims", () => {
  it("removes a dollar figure the model volunteered", () => {
    const r = redactPriceClaims("An ESP32 rover like that usually comes to about $45 in total.");
    expect(r.redacted).toBe(true);
    expect(r.reply).toBe(PRICE_REFUSAL);
    expect(r.reply).not.toMatch(/45/);
  });

  it("removes an EGP figure, in either word order", () => {
    expect(redactPriceClaims("Budget around 2500 EGP for the parts.").redacted).toBe(true);
    expect(redactPriceClaims("Budget around EGP 2500 for the parts.").redacted).toBe(true);
    expect(redactPriceClaims("That's roughly 1,800 LE.").redacted).toBe(true);
  });

  it("removes a price written in Arabic currency words", () => {
    expect(redactPriceClaims("هيكلفك حوالي 1500 جنيه تقريبًا.").redacted).toBe(true);
  });

  it("removes a range, not just a single figure", () => {
    expect(redactPriceClaims("Expect somewhere between $30 and $60.").redacted).toBe(true);
  });

  it("leaves ordinary intake conversation untouched", () => {
    const ordinary = [
      "What should the rover do when it detects an obstacle?",
      "Got it — a line follower for a competition. Any size limit on the chassis?",
      "I've noted 2 requirements and 1 constraint so far.",
      "Do you already own any of the parts?",
    ];
    for (const line of ordinary) {
      const r = redactPriceClaims(line);
      expect(r.redacted).toBe(false);
      expect(r.reply).toBe(line);
    }
  });

  it("does not trip on distances, counts or durations", () => {
    // These are the numbers an intake conversation legitimately contains.
    expect(redactPriceClaims("Detect obstacles within 30cm, then stop.").redacted).toBe(false);
    expect(redactPriceClaims("So that's 3 requirements and 2 constraints.").redacted).toBe(false);
    expect(redactPriceClaims("You said it has to be ready in 2 weeks.").redacted).toBe(false);
  });
});

/* --------------------------------------------------------------------- */
/* Readiness is computed, never taken from the model                      */
/* --------------------------------------------------------------------- */

describe("missingSlots", () => {
  it("reports all four on an empty conversation", () => {
    expect(missingSlots(EMPTY_SLOTS)).toEqual([
      "projectName",
      "requirements",
      "constraints",
      "budget",
    ]);
  });

  it("reports nothing once all four are filled", () => {
    const full = slots({
      projectName: "Line follower",
      requirements: ["Follow a black line on a white floor"],
      constraints: ["Must fit in a 20cm chassis"],
      budgetAmount: 2000,
      budgetCurrency: "EGP",
    });
    expect(missingSlots(full)).toEqual([]);
  });

  it("treats a blank or near-empty value as missing rather than filled", () => {
    const thin = slots({
      projectName: "ab",
      requirements: ["x"],
      constraints: ["  "],
      budgetAmount: 0,
    });
    expect(missingSlots(thin)).toEqual(["projectName", "requirements", "constraints", "budget"]);
  });
});

/* --------------------------------------------------------------------- */
/* Slots only grow — a forgetful model cannot erase the user's answers    */
/* --------------------------------------------------------------------- */

describe("mergeSlots", () => {
  it("keeps earlier requirements when the model returns only the newest one", () => {
    const previous = slots({ requirements: ["Detect obstacles within 30cm"] });
    const incoming = slots({ requirements: ["Follow a black line"] });
    expect(mergeSlots(previous, incoming).requirements).toEqual([
      "Detect obstacles within 30cm",
      "Follow a black line",
    ]);
  });

  it("keeps the project name and budget when the model returns nulls", () => {
    const previous = slots({
      projectName: "Guardian rover",
      budgetAmount: 2000,
      budgetCurrency: "EGP",
    });
    const merged = mergeSlots(previous, EMPTY_SLOTS);
    expect(merged.projectName).toBe("Guardian rover");
    expect(merged.budgetAmount).toBe(2000);
    expect(merged.budgetCurrency).toBe("EGP");
  });

  it("lets the user correct a value rather than only append", () => {
    const previous = slots({ projectName: "Rover", budgetAmount: 2000, budgetCurrency: "EGP" });
    const incoming = slots({ projectName: "Line follower", budgetAmount: 3500, budgetCurrency: "EGP" });
    const merged = mergeSlots(previous, incoming);
    expect(merged.projectName).toBe("Line follower");
    expect(merged.budgetAmount).toBe(3500);
  });

  it("does not duplicate a requirement the model repeats back", () => {
    const previous = slots({ requirements: ["Detect obstacles within 30cm"] });
    const incoming = slots({ requirements: ["detect obstacles within 30CM", "Stop safely"] });
    expect(mergeSlots(previous, incoming).requirements).toEqual([
      "Detect obstacles within 30cm",
      "Stop safely",
    ]);
  });

  it("keeps a platform the user already chose when a later turn omits it", () => {
    const previous = slots({ targetPlatform: "esp32" });
    expect(mergeSlots(previous, EMPTY_SLOTS).targetPlatform).toBe("esp32");
  });
});

/* --------------------------------------------------------------------- */
/* Hand-off: the conversation produces the same input the form does       */
/* --------------------------------------------------------------------- */

describe("slotsToPlanInput", () => {
  const filled = slots({
    projectName: "Line follower",
    requirements: ["Follow a black line on a white floor", "  "],
    constraints: ["Must fit in a 20cm chassis"],
    budgetAmount: 2000,
    budgetCurrency: "EGP",
    targetPlatform: "esp32",
  });

  it("converts an EGP budget to USD, as the form does", () => {
    const input = slotsToPlanInput(filled, "egypt");
    expect(input.budgetUsd).toBe(Math.round(2000 * EGP_TO_USD_FALLBACK_RATE * 100) / 100);
  });

  it("passes a USD budget through unchanged", () => {
    const input = slotsToPlanInput(slots({ budgetAmount: 80, budgetCurrency: "USD" }), "international");
    expect(input.budgetUsd).toBe(80);
  });

  it("drops entries too short to be real requirements", () => {
    expect(slotsToPlanInput(filled, "egypt").requirements).toEqual([
      "Follow a black line on a white floor",
    ]);
  });

  it("produces input the planner's own schema accepts", async () => {
    const { RequirementInputSchema } = await import("@/lib/robopilot/schema");
    expect(RequirementInputSchema.safeParse(slotsToPlanInput(filled, "egypt")).success).toBe(true);
  });
});
