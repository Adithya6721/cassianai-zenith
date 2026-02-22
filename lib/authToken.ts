import { auth } from "@/lib/firebase";

/**
 * Get fresh Firebase ID token for authenticated user
 * Forces token refresh to ensure it's always valid
 *
 * @returns Firebase ID token or null if user not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  // Force token refresh to ensure it's always fresh
  return await user.getIdToken(true);
}
