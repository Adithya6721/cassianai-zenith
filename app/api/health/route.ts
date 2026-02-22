import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<string>>> {
  return NextResponse.json({
    success: true,
    data: "OK",
  });
}
