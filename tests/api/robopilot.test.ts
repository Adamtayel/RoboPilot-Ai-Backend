import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/robopilot", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

const validPayload = {
  projectName: "Line-following rover",
  requirements: ["Detect obstacles within 30cm", "Follow a black line on a white floor"],
  constraints: ["Budget under $80"],
  budgetUsd: 80,
  targetPlatform: "esp32",
};

describe("POST /api/robopilot", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ROBOPILOT_STUB_MODE = "true";
  });

  afterEach(() => {
    delete process.env.ROBOPILOT_STUB_MODE;
  });

  it("returns a valid, schema-conforming plan for a well-formed request", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify(validPayload)));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.meta.provider_used).toBe("stub");
    expect(Array.isArray(json.components)).toBe(true);
    expect(Array.isArray(json.compatibility_checks)).toBe(true);
    expect(Array.isArray(json.milestones)).toBe(true);
    expect(Array.isArray(json.risks)).toBe(true);
    expect(Array.isArray(json.tests)).toBe(true);
    expect(typeof json.bom_total_usd).toBe("number");
  });

  it("rejects a request with no requirements (empty array)", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(
      makeRequest(JSON.stringify({ projectName: "Empty", requirements: [], constraints: [] }))
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("rejects a request missing required fields", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify({ requirements: ["only this"] })));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest("{not valid json"));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized request body", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const oversized = JSON.stringify({
      projectName: "Big",
      requirements: ["x".repeat(25_000)],
      constraints: [],
    });
    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(413);
  });

  it("rejects the GET method", async () => {
    const { GET } = await import("@/app/api/robopilot/route");
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

describe("POST /api/robopilot — provider failure path", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ROBOPILOT_STUB_MODE;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("returns a safe 502 (never a stack trace or secret) when both providers are unavailable", async () => {
    const { POST } = await import("@/app/api/robopilot/route");
    const res = await POST(makeRequest(JSON.stringify(validPayload)));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("PROVIDER_UNAVAILABLE");
    expect(json.error).not.toMatch(/GROQ_API_KEY|GEMINI_API_KEY/);
  });
});
