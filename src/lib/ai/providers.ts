/**
 * Server-only AI provider abstraction.
 *
 * - Never import this file from client components.
 * - API keys are read from process.env and never returned to the caller.
 * - Groq is tried first (fast/cheap); Gemini is the fallback provider.
 * - Both providers are asked for STRICT structured JSON output — the model
 *   proposes architecture/components/assumptions only. All pricing,
 *   compatibility and risk math happens deterministically elsewhere.
 */

export type ProviderName = "groq" | "gemini";

export class ProviderError extends Error {
  provider: ProviderName;
  cause?: unknown;

  constructor(provider: ProviderName, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.cause = cause;
  }
}

export interface StructuredCallOptions {
  systemPrompt: string;
  userPrompt: string;
  /** JSON Schema (subset) describing the required output shape. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  timeoutMs?: number;
}

export interface GenerateStructuredResult {
  data: unknown;
  providerUsed: ProviderName;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, provider: ProviderName): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new ProviderError(provider, `Request timed out after ${ms}ms`));
      }, ms);
      // Don't let the timer keep the process alive.
      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }
    }),
  ]);
}

/**
 * ---------------------------------------------------------------------------
 * Groq — OpenAI-compatible Chat Completions API with json_schema structured
 * outputs. See: https://console.groq.com/docs/structured-outputs
 * ---------------------------------------------------------------------------
 */
async function callGroq(opts: StructuredCallOptions): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new ProviderError("groq", "GROQ_API_KEY is not configured");
  }

  const body = {
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName,
        // strict:true requires additionalProperties:false on every object in
        // the schema (Groq/OpenAI-style constrained decoding). We deliberately
        // use best-effort mode instead and rely on AIDecompositionSchema.safeParse()
        // in service.ts as the real enforcement layer — this keeps one shared
        // jsonSchema object usable by both Groq and Gemini without provider-specific
        // fields, and still fails safely (AI_SCHEMA_MISMATCH) if the model drifts.
        strict: false,
        schema: opts.jsonSchema,
      },
    },
    temperature: 0.2,
  };

  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError("groq", "Network request failed", err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError("groq", `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch((err) => {
    throw new ProviderError("groq", "Response was not valid JSON envelope", err);
  });

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new ProviderError("groq", "Missing message content in response");
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new ProviderError("groq", "Model content was not valid JSON", err);
  }
}

/**
 * ---------------------------------------------------------------------------
 * Gemini — generateContent with responseMimeType + responseSchema.
 * See: https://ai.google.dev/gemini-api/docs/structured-output
 * ---------------------------------------------------------------------------
 */
async function callGemini(opts: StructuredCallOptions): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderError("gemini", "GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${opts.systemPrompt}\n\n${opts.userPrompt}` }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.jsonSchema,
      temperature: 0.2,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError("gemini", "Network request failed", err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError("gemini", `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch((err) => {
    throw new ProviderError("gemini", "Response was not valid JSON envelope", err);
  });

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new ProviderError("gemini", "Missing candidate text in response");
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ProviderError("gemini", "Model content was not valid JSON", err);
  }
}

/**
 * Groq first, Gemini fallback. Throws ProviderError only if BOTH fail.
 * This is the single entry point the rest of the app should use — it never
 * leaks which provider is configured or its key to the caller.
 */
export async function generateStructured(
  opts: StructuredCallOptions
): Promise<GenerateStructuredResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const data = await withTimeout(callGroq(opts), timeout, "groq");
    return { data, providerUsed: "groq" };
  } catch (groqErr) {
    const groqMessage = groqErr instanceof Error ? groqErr.message : String(groqErr);
    // eslint-disable-next-line no-console
    console.warn(`[robopilot] Groq provider failed, falling back to Gemini: ${groqMessage}`);

    try {
      const data = await withTimeout(callGemini(opts), timeout, "gemini");
      return { data, providerUsed: "gemini" };
    } catch (geminiErr) {
      const geminiMessage = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      throw new ProviderError(
        "gemini",
        `Both providers failed. Groq: ${groqMessage} | Gemini: ${geminiMessage}`
      );
    }
  }
}
