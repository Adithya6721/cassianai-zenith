import { authFetch } from "@/lib/authFetch";
import type { Project } from "@/types";

/**
 * Client-safe wrapper for fetching user projects
 * Uses API route instead of direct Firestore access
 */
export async function fetchProjects(): Promise<Project[]> {
  const res = await authFetch("/api/projects");
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
  }
  const data = await res.json();
  return data.data || [];
}

/**
 * Client-safe wrapper for fetching a single project by ID
 * Uses API route instead of direct Firestore access
 */
export async function fetchProjectById(projectId: string): Promise<Project | null> {
  const res = await authFetch(`/api/projects/${projectId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to fetch project");
  }
  const data = await res.json();
  return data.data || null;
}
