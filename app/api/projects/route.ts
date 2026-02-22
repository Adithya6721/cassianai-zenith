import { NextRequest, NextResponse } from "next/server";
import { getProjects } from "@/services/projectStore";
import { verifyAuthToken } from "@/lib/authHelper";

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await verifyAuthToken(request);

    // Fetch user's projects
    const projects = await getProjects(userId);

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
}
