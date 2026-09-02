import { describe, expect, it } from "vitest";
import {
  buildCandidateSnippets,
  extractBestMatch,
  usdToApproxEgp,
  EGP_TO_USD_FALLBACK_RATE,
} from "@/lib/robopilot/live-pricing";

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

  // --- Same real bug as buildCandidateSnippets below: a loose "product" ---
  // --- substring check was matching WooCommerce category/tag nav links. ---
  it("does not mistake a '/product-category/' navigation link for a real listing", () => {
    const html = `<a href="https://makerselectronics.com/product-category/robotics">Robotics</a> 400.00 EGP`;
    expect(extractBestMatch(html, "https://makerselectronics.com/", "EGP")).toBeNull();
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

// --- buildCandidateSnippets: the fix for real testing showing a large nav ---
// --- menu (hundreds of category links) drowning out the actual product   ---
// --- listings once HTML was simply truncated at a fixed length.          ---
describe("buildCandidateSnippets", () => {
  it("returns an empty string (skip the AI call) when there are no product-like anchors", () => {
    const html = `<nav>${"<a href='/category/x'>Category</a>".repeat(50)}</nav>`;
    expect(buildCandidateSnippets(html)).toBe("");
  });

  it("extracts short windows around product anchors even behind a huge unrelated nav menu", () => {
    const hugeNav = "<a href='/category/x'>Category</a>".repeat(2000); // far past any fixed-length truncation
    const html = `<nav>${hugeNav}</nav><div><a href="/product/esp32-devkit">ESP32 DevKit</a> 452.38 EGP</div>`;
    const snippets = buildCandidateSnippets(html);
    expect(snippets).not.toBe("");
    expect(snippets).toContain("ESP32 DevKit");
    // The whole nav menu must NOT have been forwarded — snippets stay short.
    expect(snippets.length).toBeLessThan(5000);
  });

  it("caps the number of candidate snippets instead of forwarding every match", () => {
    const manyProducts = Array.from(
      { length: 20 },
      (_, i) => `<a href="/product/item-${i}">Item ${i}</a> ${i + 1}.00 EGP`
    ).join(" ");
    const snippets = buildCandidateSnippets(manyProducts);
    const separatorCount = (snippets.match(/---/g) ?? []).length;
    expect(separatorCount).toBeLessThanOrEqual(5); // MAX_CANDIDATE_SNIPPETS - 1 separators
  });

  it("strips scripts and styles out of each snippet", () => {
    const html = `<a href="/product/x">X</a><script>trackClick()</script><style>.x{color:red}</style> 10.00 EGP`;
    const snippets = buildCandidateSnippets(html);
    expect(snippets).not.toContain("trackClick");
    expect(snippets).not.toContain("color:red");
  });

  // --- Real bug found by directly inspecting a live Makers Electronics    ---
  // --- product page: hundreds of "/product-category/..." and             ---
  // --- "/product-tag/..." navigation links all matched a loose "product" ---
  // --- substring check, so every candidate snippet sent to DeepSeek was  ---
  // --- category-menu noise instead of an actual listing — DeepSeek's     ---
  // --- found:false responses were correct given what it was shown.       ---
  it("does NOT treat WooCommerce category/tag navigation links as product listings", () => {
    const html = [
      '<a href="https://makerselectronics.com/product-category/robotics">Robotics</a>',
      '<a href="https://makerselectronics.com/product-category/sensors">Sensors</a>',
      '<a href="https://makerselectronics.com/product-tag/esp32">esp32</a>',
    ].join("");
    expect(buildCandidateSnippets(html)).toBe("");
  });

  it("still correctly matches a real WooCommerce product link alongside category noise", () => {
    const html = [
      '<a href="https://makerselectronics.com/product-category/robotics">Robotics</a>',
      '<a href="https://makerselectronics.com/product/esp32-development-board-38-pin">ESP32 Development Board</a> 400.00 EGP',
    ].join("");
    const snippets = buildCandidateSnippets(html);
    expect(snippets).toContain("ESP32 Development Board");
  });
});
