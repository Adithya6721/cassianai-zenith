// ──────────────────────────────────────────────
// Shared types for ZENITH2026
// ──────────────────────────────────────────────

/** Supported ingestion sources */
export type UploadSource = "github" | "zip" | "text";

/** Project source types */
export type ProjectSource = "github" | "text" | "zip";

/** Metadata about an uploaded repository */
export interface RepoMetadata {
  id: string;
  name: string;
  source: UploadSource;
  uploadedAt: string; // ISO-8601
  totalFiles: number;
}

/** A single parsed file from the repository */
export interface ParsedFile {
  id?: string; // Firestore document ID (when loaded from database)
  path: string;
  extension: string;
  language: string;
  content: string;
  sizeBytes: number;
}

/** A chunk of a file, sized for AI context windows */
export interface FileChunk {
  filePath: string;
  chunkIndex: number;
  language: string;
  content: string;
}

/** AI-generated summary for a single file */
export interface FileSummary {
  filePath: string;
  summary: string;
  language: string;
}

/** AI-generated summary for the entire repository */
export interface RepoSummary {
  repoId: string;
  overview: string;
  architecture: string;
  fileSummaries: FileSummary[];
  generatedAt: string; // ISO-8601
}

/** Response payload from the /api/upload endpoint */
export interface UploadResult {
  repoId: string;
  repoName: string;
  source: UploadSource;
  fileCount: number;
  chunkCount: number;
  files: string[];
  parsedFiles: ParsedFile[];
  chunks: FileChunk[];
  dependencies: Record<string, string[]>;
  architectureData: ProjectArchitecture;
  repoSummary: string;
  architecture: string;
}

/** Request body for the /api/chat endpoint */
export interface ChatRequest {
  repoId: string;
  question: string;
}

/** Response payload from the /api/chat endpoint */
export interface ChatResponse {
  repoId: string;
  question: string;
  answer: string;
  chunksUsed: number;
  /** Which Gemini model produced the answer, or "rule-based" / "fallback" */
  modelUsed: string;
  /** Populated only for blast-radius / impact-analysis queries */
  blastRadius?: {
    targetNodeId: string | null;
    affectedNodeIds: string[];
    affectedPaths: string[];
  };
}

/** Request body for the /api/assistant-chat endpoint */
export interface AssistantRequest {
  question: string;
}

/** Response payload from the /api/assistant-chat endpoint */
export interface AssistantResponse {
  question: string;
  answer: string;
  /** "rule-based" for instant replies, or the Gemini model name */
  modelUsed: string;
}

/** Standard API response envelope */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Architecture metadata for a project */
export interface ProjectArchitecture {
  type: "Single Script" | "Modular" | "Loose Scripts" | "Complex";
  entryPoints: string[];
  modules: string[];
  description: string;
}

/** Code Project stored in Firestore (Normalized Format) */
export interface Project {
  id: string;
  userId: string;
  name: string;
  type: ProjectSource; // "text" | "zip" | "github"
  files: ParsedFile[]; // Normalized files array
  fileCount: number;
  chunkCount: number;
  createdAt: string; // ISO-8601
  updatedAt?: string; // ISO-8601 - last modification time

  // Code intelligence fields
  dependencies?: Record<string, string[]>; // file -> imported files
  architectureData?: ProjectArchitecture; // Inferred architecture

  // Graph intelligence
  graph?: {
    nodes: Array<{
      id: string;
      type: string;
      name: string;
      path: string;
      fileId?: string;
      metadata?: Record<string, any>;
    }>;
    edges: Array<{
      id: string;
      from: string;
      to: string;
      type: string;
      metadata?: Record<string, any>;
    }>;
    stats: {
      nodeCount: number;
      edgeCount: number;
      fileCount: number;
      functionCount: number;
      classCount: number;
    };
  };

  graphSummary?: {
    nodes: number;
    edges: number;
    filesLinked: number;
    functionsDetected: number;
    classesDetected: number;
  };

  // Legacy/optional fields for backwards compatibility
  source?: ProjectSource; // Deprecated: use 'type' instead
  githubUrl?: string;
  rawCode?: string;
  parsedFiles?: ParsedFile[]; // Deprecated: use 'files' instead
  chunks?: FileChunk[];
  summary?: string;
  architecture?: string; // Legacy AI-generated text
}
