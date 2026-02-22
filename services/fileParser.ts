import path from "path";
import fs from "fs/promises";
import type { ParsedFile, FileChunk } from "@/types";

// ── Configuration ───────────────────────────────────────────

/** Directories to skip during recursive walk */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
]);

/** File patterns to skip (matched against the basename) */
const IGNORED_FILE_PATTERNS = [/\.log$/i, /\.env(\..*)?$/i];

/** File extensions to include during parsing */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts",  ".tsx", ".js",  ".jsx",
  ".py",  ".java", ".go", ".rs",
  ".json", ".yaml", ".yml", ".toml",
  ".md",  ".txt", ".html", ".css", ".scss",
  ".sh",  ".bash",
  ".c",   ".cpp", ".h",
  ".rb",  ".php", ".swift", ".kt",
  ".sql", ".graphql",
  ".dockerfile",
  ".xml", ".svg",
]);

/** Extensions known to be binary — reject immediately */
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

/** Max file size (bytes) to read — skip very large files */
const MAX_FILE_SIZE = 500 * 1024; // 500 KB

/** Target size per chunk (chars). Chunks may exceed this slightly to avoid mid-line splits. */
const CHUNK_TARGET = 1200;
/** Hard ceiling per chunk (chars) */
const CHUNK_MAX = 1500;

// ── Helpers ─────────────────────────────────────────────────

/**
 * Check if a filename matches any ignored pattern.
 */
function isIgnoredFile(fileName: string): boolean {
  return IGNORED_FILE_PATTERNS.some((re) => re.test(fileName));
}

/**
 * Return true if the extension is known-binary or not in the supported set.
 */
function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Heuristic: scan the first 8 KB of a buffer for null bytes.
 * If any are found the file is almost certainly binary.
 */
function looksLikeBinary(buf: Buffer): boolean {
  const scanLen = Math.min(buf.length, 8192);
  for (let i = 0; i < scanLen; i++) {
    if (buf[i] === 0x00) return true;
  }
  return false;
}

/**
 * Return the language identifier from a file extension.
 */
export function extensionToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript",  ".tsx": "typescript",
    ".js": "javascript",  ".jsx": "javascript",
    ".py": "python",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".json": "json",
    ".yaml": "yaml",      ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",     ".txt": "plaintext",
    ".html": "html",
    ".css": "css",         ".scss": "scss",
    ".sh": "shell",        ".bash": "shell",
    ".c": "c",             ".cpp": "cpp",  ".h": "c",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".sql": "sql",
    ".graphql": "graphql",
    ".xml": "xml",         ".svg": "svg",
    ".dockerfile": "dockerfile",
  };
  return map[ext] ?? "plaintext";
}

// ── Directory walking ───────────────────────────────────────

/**
 * Recursively walk a directory tree and collect all file paths,
 * skipping ignored directories.
 */
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results; // unreadable directory — skip silently
  }

  for (const entry of entries) {
    const name = entry.name;
    if (IGNORED_DIRS.has(name)) continue;

    const fullPath = path.join(dir, name);

    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

// ── File listing (lightweight, no content) ──────────────────

/**
 * Recursively list all non-ignored file paths (relative) in a directory.
 */
export async function listFiles(rootDir: string): Promise<string[]> {
  const allPaths = await walkDir(rootDir);
  const files: string[] = [];

  for (const filePath of allPaths) {
    const baseName = path.basename(filePath);
    if (isIgnoredFile(baseName)) continue;
    files.push(path.relative(rootDir, filePath));
  }

  return files;
}

// ── Full file parsing ───────────────────────────────────────

/**
 * Walk a directory and return ParsedFile objects for every supported
 * text file. Skips binary files, ignored patterns, unsupported extensions,
 * and files over the size cap.
 */
export async function parseFiles(rootDir: string): Promise<ParsedFile[]> {
  const allPaths = await walkDir(rootDir);
  const parsed: ParsedFile[] = [];

  for (const filePath of allPaths) {
    const baseName = path.basename(filePath);
    let ext = path.extname(filePath).toLowerCase();

    // Treat extensionless common text files as markdown
    if (!ext) {
      const base = path.basename(filePath).toLowerCase();
      if (base === "readme" || base === "license" || base === "changelog") {
        ext = ".md";
      }
    }

    // Skip ignored file patterns
    if (isIgnoredFile(baseName)) continue;

    // Skip known binary extensions
    if (isBinaryExtension(ext)) continue;

    // Skip unsupported extensions
    if (ext && !SUPPORTED_EXTENSIONS.has(ext)) continue;


    // Check file size
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue; // can't stat — skip
    }
    if (stat.size > MAX_FILE_SIZE) continue;
    if (stat.size === 0) continue;

    // Read raw bytes first for binary heuristic
    let raw: Buffer;
    try {
      raw = await fs.readFile(filePath);
    } catch {
      continue; // can't read — skip
    }

    if (looksLikeBinary(raw)) continue;

    const content = raw.toString("utf-8");
    const relativePath = path.relative(rootDir, filePath);
    const language = extensionToLanguage(ext);

    parsed.push({
      path: relativePath,
      extension: ext,
      language,
      content,
      sizeBytes: stat.size,
    });
  }

  return parsed;
}

// ── Semantic chunking ───────────────────────────────────────

/**
 * Regex patterns that indicate a "semantic boundary" in code.
 * Ordered from strongest to weakest signal.
 */
const BOUNDARY_PATTERNS: RegExp[] = [
  /^(?:export\s+)?(?:abstract\s+)?class\s+/,          // class declarations
  /^(?:export\s+)?(?:default\s+)?function[\s*(]/,      // function declarations
  /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=/,        // top-level assignments
  /^(?:export\s+)?(?:interface|type|enum)\s+/,          // TS type declarations
  /^(?:def|async\s+def)\s+/,                           // Python functions
  /^#{1,3}\s+/,                                        // Markdown headings
  /^\s*$/,                                             // blank lines (weakest)
];

/**
 * Score a line as a potential chunk boundary. Higher = better split point.
 */
function boundaryScore(line: string): number {
  const trimmed = line.trimStart();
  for (let i = 0; i < BOUNDARY_PATTERNS.length; i++) {
    if (BOUNDARY_PATTERNS[i].test(trimmed)) {
      return BOUNDARY_PATTERNS.length - i; // higher score for stronger signal
    }
  }
  return 0;
}

/**
 * Split a single file's content into semantic chunks.
 *
 * Strategy:
 *  1. Split content into lines.
 *  2. Accumulate lines into the current chunk.
 *  3. Once the chunk reaches CHUNK_TARGET, look for the best boundary
 *     line within the remaining space (up to CHUNK_MAX). If none is
 *     found, hard-break at CHUNK_MAX.
 *  4. Start a new chunk and repeat.
 */
export function chunkContent(content: string): string[] {
  if (content.length <= CHUNK_MAX) {
    return [content];
  }

  const lines = content.split("\n");
  const chunks: string[] = [];

  let currentLines: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLen = line.length + 1; // +1 for the newline

    // If adding this line would exceed CHUNK_MAX, flush first
    if (currentLen + lineLen > CHUNK_MAX && currentLines.length > 0) {
      chunks.push(currentLines.join("\n"));
      currentLines = [];
      currentLen = 0;
    }

    currentLines.push(line);
    currentLen += lineLen;

    // Once we pass the target, look for a natural boundary to split
    if (currentLen >= CHUNK_TARGET && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const score = boundaryScore(nextLine);

      // Split if the next line is a strong boundary (score >= 1),
      // or if we've exceeded the target by 50%+
      if (score > 0 || currentLen >= CHUNK_MAX) {
        chunks.push(currentLines.join("\n"));
        currentLines = [];
        currentLen = 0;
      }
    }
  }

  // Push whatever remains
  if (currentLines.length > 0) {
    chunks.push(currentLines.join("\n"));
  }

  return chunks;
}

/**
 * Take an array of ParsedFiles and produce FileChunks for every file.
 * Returns a flat array of all chunks across all files.
 */
export async function chunkFiles(files: ParsedFile[]): Promise<FileChunk[]> {
  const allChunks: FileChunk[] = [];

  for (const file of files) {
    const pieces = chunkContent(file.content);
    const language = file.language;

    for (let i = 0; i < pieces.length; i++) {
      allChunks.push({
        filePath: file.path,
        chunkIndex: i,
        language,
        content: pieces[i],
      });
    }
  }

  return allChunks;
}
