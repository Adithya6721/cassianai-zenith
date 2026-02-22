import { NextRequest, NextResponse } from "next/server";
import { getProjectById, deleteProject } from "@/services/projectStore";
import { verifyAuthToken } from "@/lib/authHelper";

/**
 * GET /api/projects/[projectId]
 * Fetch a single project by ID (with ownership verification)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await verifyAuthToken(request);
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 }
      );
    }

    const project = await getProjectById(projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (project.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: project });
  } catch (err) {
    console.error("Get project error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]
 * Delete a project by ID (with ownership verification)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await verifyAuthToken(request);
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Get project to verify it exists and ownership
    const project = await getProjectById(projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (project.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete the project
    await deleteProject(projectId);

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (err) {
    console.error("Delete project error:", err);
    const message = err instanceof Error ? err.message : "Failed to delete project";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
