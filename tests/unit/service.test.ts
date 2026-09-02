import { describe, expect, it } from "vitest";
import { isPlausiblePrice } from "@/lib/robopilot/service";

describe("isPlausiblePrice", () => {
  // --- The exact real-world bug this check exists to catch: live testing ---
  // --- showed Makers Electronics returning $0.15 for an ESP32-WROOM-32     ---
  // --- DevKit (catalog reference $9.50) — the extractor almost certainly   ---
  // --- grabbed an unrelated nearby number instead of the real price.       ---
  it("rejects a scraped price wildly below the known catalog reference price", () => {
    expect(isPlausiblePrice(0.15, 9.5)).toBe(false);
  });

  it("accepts a scraped price reasonably close to the catalog reference price", () => {
    expect(isPlausiblePrice(8.75, 9.5)).toBe(true); // cheaper, real-world variance
    expect(isPlausiblePrice(11.0, 9.5)).toBe(true); // pricier, real-world variance
  });

  it("rejects a scraped price wildly above the known catalog reference price", () => {
    expect(isPlausiblePrice(200, 9.5)).toBe(false);
  });

  it("falls back to an absolute floor when there is no catalog reference price", () => {
    expect(isPlausiblePrice(0.15)).toBe(false); // same bug value, no reference available
    expect(isPlausiblePrice(6.72)).toBe(true); // a real observed live price, e.g. a sensor array
  });

  it("treats the boundary ratios as acceptable (inclusive)", () => {
    expect(isPlausiblePrice(1.5, 10)).toBe(true); // ratio exactly 0.15
    expect(isPlausiblePrice(60, 10)).toBe(true); // ratio exactly 6
  });
});
