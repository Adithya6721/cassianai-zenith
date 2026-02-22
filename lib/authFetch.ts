import { getAuthToken } from "@/lib/authToken";

/**
 * Authenticated fetch wrapper that automatically includes Firebase ID token
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No authenticated user. Please log in.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  // Let browser set multipart boundary automatically
  if (!(options.body instanceof FormData)) {
    if (!headers.has("Content-Type") && options.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
