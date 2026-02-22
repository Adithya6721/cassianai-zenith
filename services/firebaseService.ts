import type { RepoMetadata, RepoSummary } from "@/types";

/**
 * Persist repository metadata to Firestore.
 */
export async function saveRepoMetadata(metadata: RepoMetadata): Promise<void> {
  // TODO: write to Firestore `repos/{id}` collection
  void metadata;
  throw new Error("saveRepoMetadata not implemented");
}

/**
 * Persist a repo summary to Firestore.
 */
export async function saveRepoSummary(summary: RepoSummary): Promise<void> {
  // TODO: write to Firestore `summaries/{repoId}` collection
  void summary;
  throw new Error("saveRepoSummary not implemented");
}

/**
 * Retrieve repository metadata by ID.
 */
export async function getRepoMetadata(repoId: string): Promise<RepoMetadata | null> {
  // TODO: read from Firestore `repos/{repoId}`
  void repoId;
  throw new Error("getRepoMetadata not implemented");
}

/**
 * Retrieve a repo summary by repo ID.
 */
export async function getRepoSummary(repoId: string): Promise<RepoSummary | null> {
  // TODO: read from Firestore `summaries/{repoId}`
  void repoId;
  throw new Error("getRepoSummary not implemented");
}
