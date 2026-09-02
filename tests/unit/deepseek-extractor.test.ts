import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractWithDeepSeek } from "@/lib/robopilot/deepseek-extractor";

function mockDeepSeekResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

describe("extractWithDeepSeek", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null immediately when DEEPSEEK_API_KEY is not configured", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled(); // never even attempts the network call
  });

  it("parses a well-formed found:true response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockDeepSeekResponse(
        JSON.stringify({ found: true, productName: "ESP32-WROOM-32 DevKit", price: 450, url: "/products/esp32" })
      )
    ) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html>...real fetched page...</html>", "ESP32", "EGP");
    expect(result).toEqual({
      productName: "ESP32-WROOM-32 DevKit",
      price: 450,
      url: "/products/esp32",
    });
  });

  it("returns null when the model reports found:false", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: false }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html>no match here</html>", "Some Obscure Part", "EGP");
    expect(result).toBeNull();
  });

  it("returns null and does not throw on a non-JSON response", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse("not valid json")) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null on a malformed shape (missing price)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: true, productName: "Something" }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null on a non-positive price (defense against a bad extraction)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: true, productName: "X", price: 0 }))) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null (not throws) on an HTTP error", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockDeepSeekResponse("", false, 401)) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("returns null (not throws) when the network request itself fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await extractWithDeepSeek("<html></html>", "ESP32", "EGP");
    expect(result).toBeNull();
  });

  it("sends the configured model, or the deepseek-v4-flash default", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockDeepSeekResponse(JSON.stringify({ found: false })));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await extractWithDeepSeek("<html></html>", "ESP32", "EGP");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
