import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICE_REFUSAL } from "@/lib/robopilot/chat-service";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/robopilot/chat", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/robopilot/chat", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ROBOPILOT_STUB_MODE = "true";
  });

  afterEach(() => {
    delete process.env.ROBOPILOT_STUB_MODE;
    vi.restoreAllMocks();
  });

  it("answers a first message and reports every slot as still missing", async () => {
    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "I want to build a line follower" }] })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(typeof json.reply).toBe("string");
    expect(json.ready).toBe(false);
    expect(json.missing.length).toBeGreaterThan(0);
    expect(json.meta.provider_used).toBe("stub");
  });

  it("carries collected slots forward across turns instead of restarting", async () => {
    const { POST } = await import("@/app/api/robopilot/chat/route");
    const collected = {
      projectName: "Line follower",
      requirements: ["Follow a black line on a white floor"],
      constraints: [],
      budgetAmount: null,
      budgetCurrency: null,
      targetPlatform: "esp32" as const,
    };

    const res = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "I want to build a line follower" },
          { role: "assistant", content: "What does it have to do?" },
          { role: "user", content: "It must fit in a 20cm chassis" },
        ],
        collected,
      })
    );
    const json = await res.json();

    expect(json.collected.projectName).toBe("Line follower");
    expect(json.collected.requirements).toContain("Follow a black line on a white floor");
    expect(json.collected.targetPlatform).toBe("esp32");
    expect(json.missing).not.toContain("projectName");
    expect(json.missing).not.toContain("requirements");
  });

  it("is ready only once all four slots are filled", async () => {
    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "2000" }],
        collected: {
          projectName: "Line follower",
          requirements: ["Follow a black line"],
          constraints: ["Must fit a 20cm chassis"],
          budgetAmount: 2000,
          budgetCurrency: "EGP",
          targetPlatform: "esp32",
        },
      })
    );
    const json = await res.json();
    expect(json.missing).toEqual([]);
    expect(json.ready).toBe(true);
  });

  it("rejects an empty conversation", async () => {
    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await import("@/app/api/robopilot/chat/route");
    expect((await POST(makeRequest("{nope"))).status).toBe(400);
  });

  it("rejects an oversized transcript before reaching a provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "x".repeat(45_000) }] })
    );
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects the GET method", async () => {
    const { GET } = await import("@/app/api/robopilot/chat/route");
    expect((await GET()).status).toBe(405);
  });
});

/* --------------------------------------------------------------------- */
/* The rule, enforced on the real route rather than on a helper           */
/* --------------------------------------------------------------------- */

describe("POST /api/robopilot/chat — a price cannot reach the user", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ROBOPILOT_STUB_MODE;
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("redacts a cost estimate even when the model insists on giving one", async () => {
    vi.doMock("@/lib/ai/providers", () => ({
      ProviderError: class ProviderError extends Error {},
      generateStructured: vi.fn().mockResolvedValue({
        providerUsed: "groq",
        data: {
          reply:
            "Sure! A build like that usually runs about $45 total, or roughly 2,100 EGP. Want me to plan it?",
          collected: {
            projectName: "Line follower",
            requirements: ["Follow a black line"],
            constraints: ["20cm chassis"],
            budgetAmount: 2000,
            budgetCurrency: "EGP",
            targetPlatform: "esp32",
          },
          readyToPlan: true,
        },
      }),
    }));

    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "roughly how much will this cost?" }] })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.reply).toBe(PRICE_REFUSAL);
    expect(json.reply).not.toMatch(/45|2,100|2100/);
    expect(json.meta.priceClaimRedacted).toBe(true);
    // The slots it collected on the same turn are still kept — refusing to
    // quote a price is not a reason to throw away the intake.
    expect(json.collected.projectName).toBe("Line follower");
  });

  it("does not mark the conversation ready just because the model said so", async () => {
    vi.doMock("@/lib/ai/providers", () => ({
      ProviderError: class ProviderError extends Error {},
      generateStructured: vi.fn().mockResolvedValue({
        providerUsed: "groq",
        data: {
          reply: "Great, I have everything I need.",
          collected: {
            projectName: "Line follower",
            requirements: [],
            constraints: [],
            budgetAmount: null,
            budgetCurrency: null,
            targetPlatform: "unspecified",
          },
          // The model claims it is done with three of four slots empty.
          readyToPlan: true,
        },
      }),
    }));

    const { POST } = await import("@/app/api/robopilot/chat/route");
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "line follower" }] }));
    const json = await res.json();

    expect(json.ready).toBe(false);
    expect(json.missing).toEqual(["requirements", "constraints", "budget"]);
  });
});
