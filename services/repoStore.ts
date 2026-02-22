import type { FileChunk, RepoSummary } from "@/types";

/**
 * In-memory store for processed repository data.
 *
 * Keeps chunks and summaries in memory keyed by repoId so the chat
 * endpoint can retrieve them without re-cloning the repo.
 * This can be swapped for Firebase/Redis later.
 */

interface StoredRepo {
  repoId: string;
  repoName: string;
  chunks: FileChunk[];
  summary: RepoSummary;
  storedAt: number; // Date.now()
}

/** TTL for stored repos (1 hour) */
const TTL_MS = 60 * 60 * 1000;

/** Max repos to keep in memory */
const MAX_ENTRIES = 50;

const store = new Map<string, StoredRepo>();

/**
 * Evict entries older than TTL and cap at MAX_ENTRIES.
 */
function evict(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.storedAt > TTL_MS) {
      store.delete(id);
    }
  }

  // If still over limit, remove oldest
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort(
      (a, b) => a[1].storedAt - b[1].storedAt
    );
    const toRemove = sorted.slice(0, store.size - MAX_ENTRIES);
    for (const [id] of toRemove) {
      store.delete(id);
    }
  }
}

/**
 * Store a processed repo's chunks and summary.
 */
export function saveRepo(
  repoId: string,
  repoName: string,
  chunks: FileChunk[],
  summary: RepoSummary
): void {
  evict();
  store.set(repoId, {
    repoId,
    repoName,
    chunks,
    summary,
    storedAt: Date.now(),
  });
}

/**
 * Retrieve stored chunks for a repo. Returns null if not found or expired.
 */
export function getChunks(repoId: string): FileChunk[] | null {
  const entry = store.get(repoId);
  if (!entry) return null;

  if (Date.now() - entry.storedAt > TTL_MS) {
    store.delete(repoId);
    return null;
  }

  return entry.chunks;
}

/**
 * Retrieve stored summary for a repo. Returns null if not found or expired.
 */
export function getSummary(repoId: string): RepoSummary | null {
  const entry = store.get(repoId);
  if (!entry) return null;

  if (Date.now() - entry.storedAt > TTL_MS) {
    store.delete(repoId);
    return null;
  }

  return entry.summary;
}

/**
 * Check if a repo exists in the store.
 */
export function hasRepo(repoId: string): boolean {
  return getChunks(repoId) !== null;
}
