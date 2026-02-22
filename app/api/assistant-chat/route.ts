import { NextRequest, NextResponse } from "next/server";
import { askAssistant } from "@/services/assistantService";
import { verifyAuthToken, unauthorizedResponse } from "@/lib/authHelper";
import type { ApiResponse, AssistantRequest, AssistantResponse } from "@/types";

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<AssistantResponse>>> {
  try {
    // Verify authentication
    try {
      await verifyAuthToken(request);
    } catch (error) {
      console.error("Authentication failed:", error);
      return unauthorizedResponse(
        error instanceof Error ? error.message : "Authentication failed"
      );
    }

    const body = (await request.json()) as Partial<AssistantRequest>;

    // ── Validate input ──────────────────────────────────────
    if (!body.question || typeof body.question !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid `question` field" },
        { status: 400 }
      );
    }

    const question = body.question.trim();
    if (question.length > 2000) {
      return NextResponse.json(
        { success: false, error: "Question exceeds 2000 character limit" },
        { status: 400 }
      );
    }

    // ── Ask the assistant ─────────────────────────────────────
    const result = await askAssistant(question);

    console.log(
      `[assistant-chat/route] model=${result.modelUsed} question="${question.slice(0, 60)}..."`
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error in assistant chat";

    console.error(`[assistant-chat/route] Error: ${message}`);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
