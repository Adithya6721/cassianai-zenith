import path from "path";
import fs from "fs/promises";
import { simpleGit } from "simple-git";
import AdmZip from "adm-zip";
import { v4 as uuidv4 } from "uuid";
import type { UploadSource } from "@/types";

const REPOS_ROOT = path.join("/tmp", "repos");

export interface LoadResult {
  localPath: string;
  repoName: string;
  repoId: string;
}

/**
 * Ensure the /tmp/repos base directory exists.
 */
async function ensureReposDir(): Promise<void> {
  await fs.mkdir(REPOS_ROOT, { recursive: true });
}

/**
 * Extract a human-readable repo name from a GitHub URL.
 *   https://github.com/user/my-repo.git  →  "my-repo"
 *   https://github.com/user/my-repo      →  "my-repo"
 */
function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  const last = cleaned.split("/").pop();
  return last || "unknown-repo";
}

/**
 * Extract a repo name from a ZIP filename.
 *   project-main.zip  →  "project-main"
 */
function repoNameFromZip(fileName: string): string {
  return fileName.replace(/\.zip$/i, "") || "unknown-repo";
}

/**
 * Create a single-file project from raw text.
 */
export async function createTextProject(
  rawText: string,
  projectName: string
): Promise<LoadResult> {
  await ensureReposDir();

  const repoId = uuidv4();
  const repoName = projectName || "text-upload";
  const localPath = path.join(REPOS_ROOT, repoId);

  await fs.mkdir(localPath, { recursive: true });

  // Detect file extension from content (simple heuristic)
  let extension = ".txt";
  if (rawText.includes("function ") || rawText.includes("const ") || rawText.includes("import ")) {
    extension = ".js";
  } else if (rawText.includes("def ") || rawText.includes("import ")) {
    extension = ".py";
  } else if (rawText.includes("package ") || rawText.includes("func ")) {
    extension = ".go";
  } else if (rawText.includes("class ") && rawText.includes("public ")) {
    extension = ".java";
  }

  const fileName = `main${extension}`;
  const filePath = path.join(localPath, fileName);
  await fs.writeFile(filePath, rawText, "utf-8");

  return { localPath, repoName, repoId };
}

/**
 * Create a multi-file project from text files.
 */
export async function createMultiFileTextProject(
  files: Array<{ fileName: string; code: string }>,
  projectName: string
): Promise<LoadResult> {
  await ensureReposDir();

  const repoId = uuidv4();
  const repoName = projectName || "text-upload";
  const localPath = path.join(REPOS_ROOT, repoId);

  await fs.mkdir(localPath, { recursive: true });

  // Write each file to the local directory
  for (const file of files) {
    const filePath = path.join(localPath, file.fileName);

    // Create parent directories if needed (for paths like "src/utils.js")
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write the file
    await fs.writeFile(filePath, file.code, "utf-8");
  }

  return { localPath, repoName, repoId };
}

/**
 * Validate that a string looks like a GitHub HTTPS URL.
 */
function isValidGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.pathname.split("/").filter(Boolean).length >= 2
    );
  } catch {
    return false;
  }
}

/**
 * Clone a public GitHub repository to /tmp/repos/{uuid}.
 */
export async function cloneRepo(repoUrl: string): Promise<LoadResult> {
  if (!isValidGitHubUrl(repoUrl)) {
    throw new Error(
      "Invalid GitHub URL. Please provide an HTTPS github.com URL."
    );
  }

  await ensureReposDir();

  const repoId = uuidv4();
  const repoName = repoNameFromUrl(repoUrl);
  const localPath = path.join(REPOS_ROOT, repoId);

  const git = simpleGit();
  await git.clone(repoUrl, localPath, ["--depth", "1"]);

  return { localPath, repoName, repoId };
}

/**
 * Extract an uploaded ZIP buffer to /tmp/repos/{uuid}.
 *
 * Protects against zip-slip by ensuring every extracted path
 * stays within the target directory.
 */
export async function extractZip(
  buffer: Buffer,
  fileName: string
): Promise<LoadResult> {
  await ensureReposDir();

  const repoId = uuidv4();
  const repoName = repoNameFromZip(fileName);
  const localPath = path.join(REPOS_ROOT, repoId);

  await fs.mkdir(localPath, { recursive: true });

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const dest = path.join(localPath, entry.entryName);

    // Zip-slip guard
    if (!dest.startsWith(localPath + path.sep) && dest !== localPath) {
      throw new Error(`Zip slip detected: ${entry.entryName}`);
    }

    if (entry.isDirectory) {
      await fs.mkdir(dest, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, entry.getData());
    }
  }

  return { localPath, repoName, repoId };
}

/**
 * Unified entry point — delegates to clone or extract based on source type.
 */
export async function loadRepo(
  source: UploadSource,
  payload: string | Buffer,
  fileName?: string
): Promise<LoadResult> {
  switch (source) {
    case "github":
      return cloneRepo(payload as string);
    case "zip":
      return extractZip(payload as Buffer, fileName ?? "upload.zip");
    case "text":
      return createTextProject(payload as string, fileName ?? "text-upload");
    default:
      throw new Error(`Unsupported upload source: ${source as string}`);
  }
}

/**
 * Remove a repo directory once it's no longer needed.
 */
export async function cleanupRepo(localPath: string): Promise<void> {
  // Safety: only delete inside /tmp/repos
  if (!localPath.startsWith(REPOS_ROOT)) {
    throw new Error("Refusing to delete path outside /tmp/repos");
  }
  await fs.rm(localPath, { recursive: true, force: true });
}
