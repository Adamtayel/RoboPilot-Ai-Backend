/**
 * Reads a handful of SHORT, targeted HTML snippets (built by
 * buildCandidateSnippets in live-pricing.ts — each centered on a real
 * product-link anchor found in a page that was just fetched over HTTP) and
 * asks DeepSeek to pick the one that matches the given component and
 * extract its name and price. This is fundamentally different from asking
 * an AI to recall a price from its training data: the model only ever sees
 * content that was just pulled from the live page moments earlier, and is
 * explicitly told not to use any outside knowledge. Sending short targeted
 * snippets instead of a full page keeps token cost low and keeps the model
 * from getting lost in navigation menus/headers. If DeepSeek is
 * unavailable, the caller falls back to the plain regex extractor in
 * live-pricing.ts — this module never blocks the pipeline.
 *
 * Model note: deepseek-chat / deepseek-reasoner were retired 2026-07-24.
 * The current default here is deepseek-v4-flash, with thinking mode
 * explicitly disabled (we want fast, cheap, deterministic-shaped
 * extraction, not a reasoning trace).
 */

export interface ExtractedListing {
  productName: string;
  price: number;
  url?: string;
}

const DEEPSEEK_TIMEOUT_MS = 8000;

function buildSystemPrompt(componentQuery: string, currency: "EGP" | "USD"): string {
  return [
    "You will receive several short HTML snippets. Each one is centered on a real product link from",
    "an e-commerce search-results page that was fetched over HTTP moments ago, separated by '---'.",
    "That HTML is the ONLY source of truth — never use any prior/outside knowledge of what this kind",
    "of product usually costs, even if you recall it.",
    `Pick the ONE snippet that best matches the search term "${componentQuery}" and extract its listing.`,
    'Respond with a json object only: {"found": boolean, "productName": string, "price": number, "url": string}.',
    `"price" must be a plain number in ${currency}, with no currency symbol or thousands separators.`,
    '"url" is the href of that listing\'s link if visible in the snippet, or "" if not found.',
    'If none of the snippets plausibly match, respond exactly {"found": false}.',
  ].join(" ");
}

export async function extractWithDeepSeek(
  candidateSnippets: string,
  componentQuery: string,
  currency: "EGP" | "USD"
): Promise<ExtractedListing | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null; // caller falls back to the regex extractor

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        messages: [
          { role: "system", content: buildSystemPrompt(componentQuery, currency) },
          { role: "user", content: candidateSnippets },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[deepseek-extractor] HTTP ${res.status} extracting "${componentQuery}"`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.warn(`[deepseek-extractor] missing content extracting "${componentQuery}"`);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`[deepseek-extractor] non-JSON response extracting "${componentQuery}"`);
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record?.found !== true) return null;
    if (typeof record.productName !== "string" || typeof record.price !== "number") {
      console.warn(`[deepseek-extractor] malformed shape extracting "${componentQuery}"`);
      return null;
    }
    if (!(record.price > 0)) return null;

    return {
      productName: record.productName,
      price: record.price,
      url: typeof record.url === "string" && record.url.length > 0 ? record.url : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[deepseek-extractor] request failed extracting "${componentQuery}": ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
