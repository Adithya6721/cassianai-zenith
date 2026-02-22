import { NextRequest, NextResponse } from "next/server";
import { askQuestion } from "@/services/chatService";
import { verifyAuthToken, unauthorizedResponse } from "@/lib/authHelper";
import type { ApiResponse, ChatResponse } from "@/types";

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ChatResponse>>> {
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

    const body = await request.json() as Record<string, unknown>;

    // Accept either `projectId` or `repoId` (frontend sends repoId for backwards compat)
    const projectId = (body.projectId ?? body.repoId) as string | undefined;

    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid `projectId` field" },
        { status: 400 }
      );
    }

    const question = body.question as string | undefined;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid `question` field" },
        { status: 400 }
      );
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      return NextResponse.json(
        { success: false, error: "Question cannot be empty" },
        { status: 400 }
      );
    }

    if (trimmedQuestion.length > 2000) {
      return NextResponse.json(
        { success: false, error: "Question exceeds 2000 character limit" },
        { status: 400 }
      );
    }

    // ── Graph-RAG retrieval + Gemini response ──────────────
    const result = await askQuestion(projectId.trim(), trimmedQuestion);

    console.log(
      `[chat/route] project=${projectId} model=${result.modelUsed} files=${result.chunksUsed} q="${trimmedQuestion.slice(0, 60)}..."`
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during chat";

    console.error(`[chat/route] Error: ${message}`);

    const status = message.includes("not found") ? 404 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
