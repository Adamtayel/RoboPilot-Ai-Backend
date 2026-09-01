import { NextRequest, NextResponse } from "next/server";
import { RequirementInputSchema } from "@/lib/robopilot/schema";
import { generatePlan, ServiceError } from "@/lib/robopilot/service";

// Must run in the Node.js runtime (not Edge) — provider calls need standard fetch + env access.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 20_000;

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = RequirementInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request did not match the required schema.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const plan = await generatePlan(parsed.data);
    return NextResponse.json(plan, { status: 200 });
  } catch (err) {
    if (err instanceof ServiceError) {
      // Safe, user-facing message only — never leak provider error internals or secrets.
      console.error(`[robopilot] ${err.code}: ${err.message}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error("[robopilot] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405 });
}
