import { describe, expect, it } from "vitest";
import { extractBestMatch, usdToApproxEgp, EGP_TO_USD_FALLBACK_RATE } from "@/lib/robopilot/live-pricing";

// Fixtures deliberately mirror the real markup shapes seen when the three
// Egyptian stores and SparkFun were inspected while building this feature —
// not exact copies of their HTML, just the same structural pattern (a
// product link followed shortly by a price token).

describe("extractBestMatch", () => {
  it("extracts an EGP price from WooCommerce-style markup (Makers Electronics)", () => {
    const html = `
      <li class="product">
        <a href="https://makerselectronics.com/product/arduino-nano-ch340/">
          <h2>Arduino Nano CH340</h2>
        </a>
        <span class="price">230.00 EGP</span>
      </li>
    `;
    const result = extractBestMatch(html, "https://makerselectronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(230);
    expect(result!.name.toLowerCase()).toContain("arduino nano");
    expect(result!.url).toBe("https://makerselectronics.com/product/arduino-nano-ch340/");
  });

  it("extracts an EGP price shown as a leading 'LE' token (Shopify-style)", () => {
    const html = `
      <div class="grid-product">
        <a href="/products/mg996r-servo-motor">
          <span class="grid-product__title">MG996R High Torque Servo Motor</span>
        </a>
        <span class="price">LE 180.00</span>
      </div>
    `;
    const result = extractBestMatch(html, "https://store.fut-electronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(180);
    // relative href should be resolved against baseUrl
    expect(result!.url).toBe("https://store.fut-electronics.com/products/mg996r-servo-motor");
  });

  it("extracts a USD price from Magento-style markup (SparkFun)", () => {
    const html = `
      <li class="product-item">
        <a class="product-item-link" href="https://www.sparkfun.com/arduino-nano-every.html">
          Arduino Nano Every
        </a>
        <span class="price">$20.00</span>
      </li>
    `;
    const result = extractBestMatch(html, "https://www.sparkfun.com/", "USD");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(20);
  });

  it("handles thousands separators in the price", () => {
    const html = `<a href="/products/nvidia-jetson">Jetson Orin Nano</a> 35,000.00 EGP`;
    const result = extractBestMatch(html, "https://makerselectronics.com/", "EGP");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(35000);
  });

  it("returns null when no product link is present", () => {
    const html = `<a href="/about-us">About Us</a><span>230.00 EGP</span>`;
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });

  it("returns null when a product link has no nearby price", () => {
    const html = `<a href="/products/arduino-nano">Arduino Nano</a><p>Currently unavailable.</p>`;
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });

  it("never matches a currency from the wrong region (USD pattern on an EGP page)", () => {
    const html = `<a href="/products/some-part">Some Part</a> $20.00`;
    // Asking for EGP but the page only has a $ price — should not match.
    expect(extractBestMatch(html, "https://electra.store/", "EGP")).toBeNull();
  });
});

// --- usdToApproxEgp: a plain, deterministic unit conversion of an already- ---
// --- known catalog price — never a price recalled from an AI model.       ---
describe("usdToApproxEgp", () => {
  it("converts a known USD price using the documented fallback rate", () => {
    const usd = 10;
    const expected = Math.round((usd / EGP_TO_USD_FALLBACK_RATE) * 100) / 100;
    expect(usdToApproxEgp(usd)).toBe(expected);
  });

  it("is deterministic: same input always produces the same output", () => {
    expect(usdToApproxEgp(9.5)).toBe(usdToApproxEgp(9.5));
  });

  it("scales linearly with the input price", () => {
    expect(usdToApproxEgp(20)).toBeCloseTo(usdToApproxEgp(10) * 2, 0);
  });
});
