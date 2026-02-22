import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "./firebaseAdmin";

/**
 * Extract and verify Firebase ID token from request
 * Returns the authenticated user's UID
 *
 * @param request - Next.js request object
 * @returns User ID if authenticated
 * @throws Error if authentication fails
 */
export async function verifyAuthToken(
  request: NextRequest
): Promise<{ userId: string; email: string | undefined }> {
  // Extract Authorization header
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("AUTH_MISSING_HEADER");
  }

  // Extract token (remove "Bearer " prefix)
  const idToken = authHeader.substring(7);

  if (!idToken) {
    throw new Error("AUTH_NO_TOKEN");
  }

  try {
    // Verify token with Firebase Admin SDK
    const decodedToken = await verifyIdToken(idToken);

    return {
      userId: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    console.error("Token verification failed:", error);
    throw new Error("AUTH_INVALID_TOKEN");
  }
}

/**
 * Return a 401 Unauthorized response with error message
 */
export function unauthorizedResponse(message: string = "Unauthorized") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

/**
 * Return a 403 Forbidden response with error message
 */
export function forbiddenResponse(message: string = "Forbidden") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}
