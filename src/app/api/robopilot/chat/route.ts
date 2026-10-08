import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema } from "@/lib/robopilot/chat-schema";
import { runChatTurn } from "@/lib/robopilot/chat-service";
import { ServiceError } from "@/lib/robopilot/service";

// Same runtime and guard rails as the plan route — see that file for why.
export const runtime = "nodejs";
export const maxDuration = 30;

// A conversation is small; a transcript this large is abuse, not a chat.
const MAX_BODY_BYTES = 40_000;

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Conversation is too long." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request did not match the required schema.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await runChatTurn(parsed.data), { status: 200 });
  } catch (err) {
    if (err instanceof ServiceError) {
      console.error(`[robopilot-chat] ${err.code}: ${err.message}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error("[robopilot-chat] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405 });
}
