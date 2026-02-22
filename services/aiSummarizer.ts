import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FileChunk, FileSummary, RepoSummary } from "@/types";

// ── Gemini single-model engine ────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";

/** Result returned by the Gemini caller */
export interface GeminiResult {
  text: string;
  model: string;
}

/**
 * Call gemini-2.0-flash once. On any failure, returns the fallback string immediately.
 * No retry loops, no model cascade — prevents 404/429 spam.
 */
export async function callGeminiWithFallback(
  prompt: string,
  fallback: string,
  opts: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<GeminiResult> {
  if (!apiKey) {
    console.warn("[gemini] GEMINI_API_KEY not set — using fallback");
    return { text: fallback, model: "fallback" };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
      },
    });

    const text = result.response.text().trim();
    if (text) {
      console.log(`[gemini] ✅ ${GEMINI_MODEL} responded (${text.length} chars)`);
      return { text, model: GEMINI_MODEL };
    }

    console.warn(`[gemini] Empty response from ${GEMINI_MODEL}, using fallback`);
    return { text: fallback, model: "fallback" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[gemini] ${GEMINI_MODEL} failed: ${errMsg} — using fallback`);
    return { text: fallback, model: "fallback" };
  }
}

/**
 * Simplified wrapper matching the old `callGemini` signature for backwards compatibility.
 * Returns just the text string.
 */
async function callGemini(prompt: string, fallback: string): Promise<string> {
  const result = await callGeminiWithFallback(prompt, fallback);
  return result.text;
}

// ── Configuration ───────────────────────────────────────────

const FILE_BATCH_SIZE = 15;
const BATCH_CHAR_LIMIT = 60_000;
const OVERVIEW_SUMMARY_LIMIT = 80;

// ── Group chunks by file ────────────────────────────────────

interface GroupedFile {
  filePath: string;
  language: string;
  chunks: string[];
}

function groupChunksByFile(chunks: FileChunk[]): GroupedFile[] {
  const map = new Map<string, GroupedFile>();

  for (const chunk of chunks) {
    let group = map.get(chunk.filePath);
    if (!group) {
      group = { filePath: chunk.filePath, language: chunk.language, chunks: [] };
      map.set(chunk.filePath, group);
    }
    group.chunks.push(chunk.content);
  }

  return Array.from(map.values());
}

// ── File-level summaries ────────────────────────────────────

function buildFileBatchPrompt(batch: GroupedFile[]): string {
  const fileBlocks = batch
    .map((f) => {
      const content = f.chunks.join("\n");
      return `### File: ${f.filePath} (${f.language})\n\`\`\`${f.language}\n${content}\n\`\`\``;
    })
    .join("\n\n");

  return `You are a senior software engineer analysing a codebase.

For EACH file below, produce a concise technical summary (2-4 sentences).
Focus on: purpose, key exports/functions, dependencies, and patterns used.

Return your answer as a numbered list in this exact format (one entry per file, no extra text):
1. **<file path>**: <summary>
2. **<file path>**: <summary>
...

${fileBlocks}`;
}

function parseBatchResponse(
  raw: string,
  batch: GroupedFile[]
): FileSummary[] {
  const summaries: FileSummary[] = [];

  for (const file of batch) {
    const escaped = file.filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.+)`, "i");
    const match = raw.match(re);

    summaries.push({
      filePath: file.filePath,
      language: file.language,
      summary: match?.[1]?.trim() || `Source file at ${file.filePath}`,
    });
  }

  return summaries;
}

/** Process at most `limit` async tasks concurrently. */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function summariseAllFiles(
  groups: GroupedFile[]
): Promise<FileSummary[]> {
  // Build batches (up to FILE_BATCH_SIZE files or BATCH_CHAR_LIMIT chars each)
  const batches: GroupedFile[][] = [];
  let currentBatch: GroupedFile[] = [];
  let currentChars = 0;

  for (const group of groups) {
    const groupChars = group.chunks.reduce((sum, c) => sum + c.length, 0);

    if (
      currentBatch.length >= FILE_BATCH_SIZE ||
      (currentBatch.length > 0 && currentChars + groupChars > BATCH_CHAR_LIMIT)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(group);
    currentChars += groupChars;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`[gemini] Summarising ${groups.length} files in ${batches.length} batches (concurrency: 5)`);

  // Process batches with max 5 concurrent Gemini calls
  const tasks = batches.map((batch) => async () => {
    const prompt = buildFileBatchPrompt(batch);
    const raw = await callGemini(
      prompt,
      batch.map((f) => `**${f.filePath}**: Source file`).join("\n")
    );
    return parseBatchResponse(raw, batch);
  });

  const batchResults = await withConcurrency(tasks, 5);
  return batchResults.flat();
}

// ── Repo-level overview ─────────────────────────────────────

function buildOverviewPrompt(
  repoName: string,
  fileSummaries: FileSummary[]
): string {
  const limited = fileSummaries.slice(0, OVERVIEW_SUMMARY_LIMIT);
  const listing = limited
    .map((s) => `- **${s.filePath}** (${s.language}): ${s.summary}`)
    .join("\n");

  return `You are a senior software architect analysing a repository named "${repoName}".

Below is a list of files and their summaries:

${listing}

Provide a concise project overview in 3-5 sentences. Cover:
- What the project does
- The primary language(s) and framework(s)
- How the code is organised (major modules/layers)

Be technical but clear. Do not list individual files.`;
}

function buildArchitecturePrompt(
  repoName: string,
  fileSummaries: FileSummary[]
): string {
  const limited = fileSummaries.slice(0, OVERVIEW_SUMMARY_LIMIT);
  const listing = limited
    .map((s) => `- ${s.filePath} (${s.language}): ${s.summary}`)
    .join("\n");

  return `You are a senior software architect analysing the architecture of "${repoName}".

File summaries:
${listing}

Produce a concise architecture overview (4-8 sentences) covering:
- System layers (frontend, backend, data, infrastructure)
- Key design patterns (MVC, microservices, event-driven, etc.)
- Data flow between major components
- Entry points and external interfaces

Be specific to this codebase. Do not list every file.`;
}

// ── Public API ──────────────────────────────────────────────

export async function summarizeRepo(
  repoId: string,
  repoName: string,
  chunks: FileChunk[]
): Promise<RepoSummary> {
  const groups = groupChunksByFile(chunks);
  const fileSummaries = await summariseAllFiles(groups);

  const [overview, architecture] = await Promise.all([
    callGemini(
      buildOverviewPrompt(repoName, fileSummaries),
      `${repoName} is a software project with ${groups.length} source files.`
    ),
    callGemini(
      buildArchitecturePrompt(repoName, fileSummaries),
      `The architecture of ${repoName} could not be determined.`
    ),
  ]);

  return {
    repoId,
    overview,
    architecture,
    fileSummaries,
    generatedAt: new Date().toISOString(),
  };
}
