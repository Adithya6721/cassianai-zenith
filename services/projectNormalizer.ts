import type { ParsedFile, FileChunk, UploadSource, ProjectArchitecture } from "@/types";
import { chunkFiles, extensionToLanguage } from "./fileParser";
import { detectProjectDependencies, resolveDependencies } from "./dependencyDetector";
import { inferArchitecture } from "./architectureInference";

// ── Configuration ───────────────────────────────────────────

/** File extensions to support */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".java", ".go", ".rs",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".txt", ".html", ".css", ".scss",
  ".sh", ".bash",
  ".c", ".cpp", ".h",
  ".rb", ".php", ".swift", ".kt",
  ".sql", ".graphql",
  ".dockerfile",
  ".xml", ".svg",
]);

/** Binary extensions to reject */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".avif",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov", ".avi",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pyc", ".class", ".o", ".obj",
  ".lock",
]);

/** Max file size (500KB) */
const MAX_FILE_SIZE = 500 * 1024;

// ── Validation Helpers ──────────────────────────────────────

/**
 * Check if a file extension is supported
 */
function isSupportedExtension(ext: string): boolean {
  return SUPPORTED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Check if a file extension is binary
 */
function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Normalize a file path to be relative and use forward slashes
 */
function normalizePath(filePath: string): string {
  // Remove leading slashes and ./ prefixes
  let normalized = filePath.replace(/^[./\\]+/, "");
  // Convert backslashes to forward slashes
  normalized = normalized.replace(/\\/g, "/");
  return normalized;
}

/**
 * Check if content appears to be binary (contains null bytes)
 */
function isBinaryContent(content: string): boolean {
  // Check for null bytes in the first 8KB
  const checkLen = Math.min(content.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

// ── File Validation ─────────────────────────────────────────

/**
 * Validate and clean a single ParsedFile
 * Returns null if the file should be rejected
 */
function validateFile(file: ParsedFile): ParsedFile | null {
  // Check required fields
  if (!file.path || !file.content) {
    console.warn(`Skipping file: missing path or content`);
    return null;
  }

  // Empty content
  if (file.content.trim().length === 0) {
    console.warn(`Skipping file ${file.path}: empty content`);
    return null;
  }

  // Get extension (default to .txt if missing)
  let extension = file.extension || "";
  if (!extension && file.path.includes(".")) {
    extension = "." + file.path.split(".").pop()!.toLowerCase();
  }
  extension = extension.toLowerCase();

  // Reject binary extensions
  if (isBinaryExtension(extension)) {
    console.warn(`Skipping file ${file.path}: binary extension ${extension}`);
    return null;
  }

  // Reject unsupported extensions
  if (extension && !isSupportedExtension(extension)) {
    console.warn(`Skipping file ${file.path}: unsupported extension ${extension}`);
    return null;
  }

  // Reject binary content
  if (isBinaryContent(file.content)) {
    console.warn(`Skipping file ${file.path}: binary content detected`);
    return null;
  }

  // Check file size
  const sizeBytes = file.sizeBytes || Buffer.byteLength(file.content, "utf-8");
  if (sizeBytes > MAX_FILE_SIZE) {
    console.warn(`Skipping file ${file.path}: too large (${sizeBytes} bytes)`);
    return null;
  }

  if (sizeBytes === 0) {
    console.warn(`Skipping file ${file.path}: zero size`);
    return null;
  }

  // Normalize path
  const normalizedPath = normalizePath(file.path);

  // Get language from extension
  const language = file.language || extensionToLanguage(extension);

  // Return cleaned file
  return {
    path: normalizedPath,
    extension: extension || ".txt",
    language,
    content: file.content,
    sizeBytes,
  };
}

// ── Normalization ───────────────────────────────────────────

export interface NormalizedProject {
  files: ParsedFile[];
  chunks: FileChunk[];
  fileCount: number;
  chunkCount: number;
  dependencies: Record<string, string[]>;
  architectureData: ProjectArchitecture;
}

/**
 * Normalize project files into a consistent format
 *
 * Accepts raw parsed files from TEXT, ZIP, or GitHub uploads
 * Returns a clean, validated project structure
 */
export async function normalizeProject(
  parsedFiles: ParsedFile[],
  source: UploadSource
): Promise<NormalizedProject> {
  console.log(`Normalizing project from ${source} with ${parsedFiles.length} raw files`);

  // Validate and clean each file
  const validFiles: ParsedFile[] = [];

  for (const file of parsedFiles) {
    const cleaned = validateFile(file);
    if (cleaned) {
      validFiles.push(cleaned);
    }
  }

  // Ensure we have at least one valid file
  if (validFiles.length === 0) {
    throw new Error("No valid files found in project. All files were empty, binary, or unsupported.");
  }

  console.log(`Valid files after normalization: ${validFiles.length}`);

  // Create chunks from valid files
  const chunks = await chunkFiles(validFiles);

  // Detect dependencies
  const rawDependencies = detectProjectDependencies(validFiles);
  const dependencies = resolveDependencies(rawDependencies, validFiles);

  // Infer architecture
  const architectureData = inferArchitecture(validFiles, dependencies);

  console.log(`Project normalized: ${validFiles.length} files, ${chunks.length} chunks`);
  console.log(`Dependencies detected: ${Object.keys(dependencies).length} files analyzed`);
  console.log(`Architecture inferred: ${architectureData.type}`);

  return {
    files: validFiles,
    chunks,
    fileCount: validFiles.length,
    chunkCount: chunks.length,
    dependencies,
    architectureData,
  };
}
