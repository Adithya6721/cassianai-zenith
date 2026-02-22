import { NextRequest, NextResponse } from "next/server";
import { getProjectById } from "@/services/projectStore";
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from "@/lib/authHelper";
import AdmZip from "adm-zip";

/**
 * GET /api/download/[projectId]
 * Download a project as a ZIP file (for ZIP-type projects)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    // Verify authentication
    let authenticatedUserId: string;
    try {
      const { userId } = await verifyAuthToken(request);
      authenticatedUserId = userId;
    } catch (error) {
      console.error("Authentication failed:", error);
      return unauthorizedResponse(
        error instanceof Error ? error.message : "Authentication failed"
      );
    }

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Get project
    const project = await getProjectById(projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Security: verify user owns the project
    if (project.userId !== authenticatedUserId) {
      console.warn(
        `User ${authenticatedUserId} attempted to download project ${projectId} owned by ${project.userId}`
      );
      return forbiddenResponse("You don't have permission to download this project");
    }

    // Only ZIP projects can be downloaded
    if (project.source !== "zip") {
      return NextResponse.json(
        { success: false, error: "Only ZIP projects can be downloaded" },
        { status: 400 }
      );
    }

    // Check if we have files to recreate the ZIP (use new 'files' field with fallback)
    const projectFiles = project.files || project.parsedFiles || [];

    if (projectFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files available for this project" },
        { status: 404 }
      );
    }

    // Create a new ZIP from stored files
    const zip = new AdmZip();

    for (const file of projectFiles) {
      // Add each file to the ZIP
      zip.addFile(file.path, Buffer.from(file.content, "utf-8"));
    }

    // Generate the ZIP buffer
    const zipBuffer = zip.toBuffer();

    // Return the ZIP file
    const fileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}.zip`;

    // Convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    const message = err instanceof Error ? err.message : "Failed to download project";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
