"use server";

import { callGeminiWithFallback } from "@/services/aiSummarizer";
import { getAdminFirestore } from "@/lib/firebaseAdmin";
import type { ChatResponse } from "@/types";

const db = getAdminFirestore();
const PROJECTS_COLLECTION = "projects";
const FILES_SUBCOLLECTION = "files";

const MAX_CONTEXT_CHARS = 40_000;
const MAX_FILE_CHARS = 8_000;
const MAX_FALLBACK_FILES = 15;
const MAX_GRAPH_FILES = 12;

// ── Rule-based intent detection ─────────────────────────────

interface RuleMatch { answer: string }

const RULES: { patterns: RegExp[]; answer: string }[] = [
  {
    patterns: [/^for narnia[\s!?.]*$/i, /^narnia[\s!?.]*$/i, /^caspian[\s!?.]*$/i, /^aslan[\s!?.]*$/i],
    answer: "I walk the path of knowledge and courage. Every system has its hidden kingdom — explore, and you will discover.",
  },
  {
    patterns: [/^(hi|hello|hey|howdy|yo|hiya|sup|what'?s up)\b/i, /^good (morning|afternoon|evening)/i],
    answer: "Hey! I'm looking at your code. Ask me anything about it — how a function works, where something is defined, or the overall structure.",
  },
  {
    patterns: [/^(thanks|thank you|thx|ty|cheers)\b/i, /^(much appreciated|appreciate it)/i],
    answer: "You're welcome! Let me know if you have more questions about the code.",
  },
  {
    patterns: [/^help\b/i, /^what can you do/i, /^how do (i|you) use/i],
    answer:
      "I can help you understand this specific codebase. Try:\n\n" +
      "- *What does the main entry point do?*\n" +
      "- *Show me the auth.ts file*\n" +
      "- *How is authentication handled?*\n" +
      "- *Explain the project structure*\n\n" +
      "I'll search through the code and give you a precise answer.",
  },
  {
    patterns: [/what (is|does) cassian/i, /what('s| is) cassian/i, /cassian stand for/i],
    answer: "I am **CASSIAN** — **Code Analysis System for Software Intelligence and Navigation**. I help you explore, understand, and interact with software systems intelligently.",
  },
  {
    patterns: [/^who are you/i, /^what are you/i, /^tell me about yourself/i, /^are you (an? )?ai/i],
    answer: "I am **CASSIAN** — **Code Analysis System for Software Intelligence and Navigation**. I help you explore, understand, and interact with software systems intelligently.",
  },
];

function matchRule(question: string): RuleMatch | null {
  const trimmed = question.trim();
  if (trimmed.length === 0) return { answer: "Looks like an empty message. Try asking a question about the code!" };
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) return { answer: rule.answer };
    }
  }
  return null;
}

// ── Query intent classifiers ─────────────────────────────────

interface RetrievalIntent {
  isRetrieval: boolean;
  targetFile: string | null;
}

/**
 * Detects "show / get / retrieve [code/file]" intent.
 * Extracts the target filename or path if mentioned.
 */
function detectRetrievalIntent(question: string): RetrievalIntent {
  const isRetrieval =
    /\b(show|get|retrieve|give|display|print|fetch|return)\b.*\b(code|file|content|source|implementation|function|class|method)\b/i.test(question) ||
    /give me (the )?(full |complete |entire )?(code|file|source|content)/i.test(question) ||
    /show (me )?(the )?(code|file|source|content) (of|for|in|from)/i.test(question) ||
    /what('?s| is) (in|inside) (the )?file/i.test(question) ||
    /^(show|get|retrieve|display)\s+[\w./\\-]+\.\w{1,10}/i.test(question.trim());

  if (!isRetrieval) return { isRetrieval: false, targetFile: null };

  // Try to extract explicit file path (quoted or unquoted with extension)
  let targetFile: string | null = null;

  const quotedMatch = question.match(/["'`]([\w./\\-]+\.\w{1,10})["'`]/);
  if (quotedMatch) { targetFile = quotedMatch[1]; }

  if (!targetFile) {
    const extMatch = question.match(/\b([\w./\\-]+\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|css|json|yaml|yml|md|sh|env))\b/i);
    if (extMatch) { targetFile = extMatch[1]; }
  }

  return { isRetrieval: true, targetFile };
}

/**
 * Detects "architecture / documentation / explain project" intent.
 */
function detectDocumentationIntent(question: string): boolean {
  return /\b(how (is|was) (this )?project (built|structured|organized)|architecture|explain (the )?(project|structure|codebase|architecture|system)|project overview|how does (the )?project work|entry point|intern|onboard|new (to|developer)|documentation|what does this project do)\b/i.test(question);
}

// ── Blast Radius intent detection ────────────────────────────

/** Detects "what breaks if I change X?" style questions. */
function detectBlastRadiusIntent(question: string): boolean {
  return (
    /\bwhat (would|will|could) break\b/i.test(question) ||
    /\bwhat breaks\b/i.test(question) ||
    /\bif (i |you )?(change|modify|update|delete|remove|refactor)\b/i.test(question) ||
    /\bwhat (depends|is dependent) on\b/i.test(question) ||
    /\b(blast radius|impact analysis|downstream files?|affected files?|dependents)\b/i.test(question) ||
    /\b(impact|consequence|effect) of (changing|modifying|updating|removing|deleting)\b/i.test(question)
  );
}

/** Extracts the target file/module name from a blast radius query. */
function extractBlastRadiusTarget(question: string): string | null {
  const quoted = question.match(/["'`]([\w./\\-]+(?:\.\w{1,10})?)/);
  if (quoted) return quoted[1];

  const withExt = question.match(
    /\b([\w./\\-]+\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|css|json|yaml|yml|sh|rb|php|swift|kt|vue|svelte))\b/i
  );
  if (withExt) return withExt[1];

  const verbTarget = question.match(
    /(?:change|modify|update|delete|remove|refactor|edit)\s+(?:the\s+)?["'`]?([\w./\\-]+(?:\.\w{1,10})?)["'`]?/i
  );
  if (verbTarget && verbTarget[1].length > 2) return verbTarget[1];

  const depTarget = question.match(
    /(?:depends? on|dependent on)\s+["'`]?([\w./\\-]+(?:\.\w{1,10})?)["'`]?/i
  );
  if (depTarget && depTarget[1].length > 2) return depTarget[1];

  return null;
}

/**
 * BFS over the reverse dependency graph to find all nodes that would be
 * affected if `targetName` changes (i.e., all transitive dependents).
 *
 * Edge semantics: `from` imports/calls `to` → if `to` changes, `from` may break.
 * We build reverseAdj[nodeId] = [nodes that import nodeId] and BFS from the target.
 */
function computeBlastRadius(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetName: string
): { targetNodeId: string | null; affectedNodeIds: string[]; affectedPaths: string[] } {
  // ── Locate the target node ─────────────────────────────────
  const targetLower = targetName.toLowerCase();
  let targetNode: GraphNode | undefined;
  let bestScore = 0;

  for (const node of nodes) {
    const pathLower = node.path.toLowerCase();
    const nameLower = node.name.toLowerCase();
    let score = 0;
    if (pathLower === targetLower || nameLower === targetLower) score = 100;
    else if (pathLower.endsWith("/" + targetLower)) score = 90;
    else if (pathLower.endsWith(targetLower)) score = 80;
    else if (pathLower.includes(targetLower) || nameLower.includes(targetLower)) score = 60;
    if (score > bestScore) { bestScore = score; targetNode = node; }
  }

  if (!targetNode || bestScore < 60) {
    return { targetNodeId: null, affectedNodeIds: [], affectedPaths: [] };
  }

  // ── Build reverse adjacency list ───────────────────────────
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!reverseAdj.has(edge.to)) reverseAdj.set(edge.to, []);
    reverseAdj.get(edge.to)!.push(edge.from);
  }

  // ── BFS: follow reverse edges to collect all dependents ────
  const visited = new Set<string>([targetNode.id]);
  const queue: string[] = [targetNode.id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of reverseAdj.get(current) ?? []) {
      if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    }
  }

  visited.delete(targetNode.id); // target itself is not "affected"

  const affectedNodeIds = Array.from(visited);
  const nodePathMap = new Map(nodes.map((n) => [n.id, n.path]));
  const affectedPaths = [...new Set(affectedNodeIds.map((id) => nodePathMap.get(id) ?? id))].sort();

  return { targetNodeId: targetNode.id, affectedNodeIds, affectedPaths };
}

// ── Firestore types ──────────────────────────────────────────

interface FileContent {
  fileId: string;
  filePath: string;
  language: string;
  content: string;
}

type GraphNode = {
  id: string;
  type: string;
  name: string;
  path: string;
  fileId?: string;
};

type GraphEdge = { id: string; from: string; to: string; type: string };

// ── Tokenizer ────────────────────────────────────────────────

function tokenise(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length >= 2);
}

// ── Exact / fuzzy file search ────────────────────────────────

/**
 * Search for a specific file by path/name in the project's files subcollection.
 * Tries exact match, then suffix match, then substring match.
 * Always scoped to `projectId`.
 */
async function findExactFile(projectId: string, target: string): Promise<FileContent | null> {
  const snapshot = await db
    .collection(PROJECTS_COLLECTION)
    .doc(projectId)
    .collection(FILES_SUBCOLLECTION)
    .get();

  const targetLower = target.toLowerCase();
  let bestMatch: FileContent | null = null;
  let bestScore = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const filePath: string = data.filePath || "";
    const pathLower = filePath.toLowerCase();

    let score = 0;
    if (pathLower === targetLower) score = 100;                          // exact
    else if (pathLower.endsWith("/" + targetLower)) score = 90;          // exact suffix
    else if (pathLower.endsWith(targetLower)) score = 80;                // partial suffix
    else if (pathLower.includes(targetLower)) score = 60;                // substring

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { fileId: doc.id, filePath: data.filePath, language: data.language, content: data.content };
    }
  }

  return bestScore >= 60 ? bestMatch : null;
}

// ── Graph traversal ──────────────────────────────────────────

function scoreNode(node: GraphNode, queryTokens: string[], rawQuery: string): number {
  const nameLower = node.name.toLowerCase();
  const pathLower = node.path.toLowerCase();
  const queryLower = rawQuery.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (nameLower.includes(token)) score += 5;
    if (pathLower.includes(token)) score += 2;
  }
  if (nameLower.length > 3 && queryLower.includes(nameLower)) score += 15;
  if (node.type === "file" || node.type === "module") score += 1;
  return score;
}

function traverseGraph(nodes: GraphNode[], edges: GraphEdge[], queryTokens: string[], rawQuery: string): Set<string> {
  const scored = nodes.map((n) => ({ node: n, score: scoreNode(n, queryTokens, rawQuery) }));
  scored.sort((a, b) => b.score - a.score);
  const seeds = scored.slice(0, 8).filter((s) => s.score > 0);
  if (seeds.length === 0) return new Set();

  const seedIds = new Set(seeds.map((s) => s.node.id));
  for (const edge of edges) {
    if (seedIds.has(edge.from)) seedIds.add(edge.to);
    if (seedIds.has(edge.to)) seedIds.add(edge.from);
  }

  const fileIds = new Set<string>();
  for (const node of nodes) {
    if (seedIds.has(node.id) && node.fileId) fileIds.add(node.fileId);
  }
  return fileIds;
}

// ── File fetchers ────────────────────────────────────────────

async function fetchFilesByIds(projectId: string, fileIds: Set<string>): Promise<FileContent[]> {
  if (fileIds.size === 0) return [];
  const filesRef = db.collection(PROJECTS_COLLECTION).doc(projectId).collection(FILES_SUBCOLLECTION);
  const refs = Array.from(fileIds).slice(0, MAX_GRAPH_FILES).map((fid) => filesRef.doc(fid));
  const docs = await db.getAll(...refs);
  return docs
    .filter((d) => d.exists && d.data())
    .map((d) => ({ fileId: d.id, filePath: d.data()!.filePath, language: d.data()!.language, content: d.data()!.content }));
}

async function fetchAndScoreAllFiles(projectId: string, queryTokens: string[], rawQuery: string): Promise<FileContent[]> {
  const snapshot = await db.collection(PROJECTS_COLLECTION).doc(projectId).collection(FILES_SUBCOLLECTION).get();
  const queryLower = rawQuery.toLowerCase();

  const scored = snapshot.docs.map((doc) => {
    const data = doc.data();
    const content: string = data.content || "";
    const filePath: string = data.filePath || "";
    let score = 0;

    for (const token of queryTokens) {
      score += Math.min((content.toLowerCase().split(token).length - 1), 5);
      if (filePath.toLowerCase().includes(token)) score += 3;
    }
    if (queryLower.length > 3 && content.toLowerCase().includes(queryLower)) score += 10;

    return { score, file: { fileId: doc.id, filePath: data.filePath, language: data.language, content: data.content } as FileContent };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_FALLBACK_FILES).map((s) => s.file);
}

// ── Context assembly ─────────────────────────────────────────

function assembleContext(files: FileContent[]): { blocks: string; fileCount: number } {
  const blocks: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    const content = file.content.length > MAX_FILE_CHARS
      ? file.content.slice(0, MAX_FILE_CHARS) + "\n// ... (truncated)"
      : file.content;

    const block = `### ${file.filePath} (${file.language})\n\`\`\`${file.language}\n${content}\n\`\`\``;
    if (totalChars + block.length > MAX_CONTEXT_CHARS) break;
    blocks.push(block);
    totalChars += block.length;
  }

  return { blocks: blocks.join("\n\n"), fileCount: blocks.length };
}

// ── Prompt builders ──────────────────────────────────────────

function buildRetrievalPrompt(question: string, contextBlocks: string, projectName?: string): string {
  return `You are CASSIAN — a code retrieval system for ${projectName ? `"${projectName}"` : "a project"}.

${contextBlocks}

---
Request: "${question}"

STRICT RULES:
- Return ONLY the exact source code from the file(s) above — nothing else.
- Use a single fenced code block. No prose before or after it.
- Do NOT say "Here is", "Certainly", "Sure", or any filler phrase.
- Do NOT paraphrase or improve the code unless the user explicitly asked for changes.
- If the requested file is not in the context above, respond with exactly one line: "File not found in the uploaded project."`;
}

function buildExplainPrompt(question: string, contextBlocks: string, projectName?: string, archSummary?: string): string {
  const scope = projectName ? `"${projectName}"` : "a project";
  const archSection = archSummary
    ? `\n\n### Project Architecture Summary\n${archSummary}`
    : "";

  return `You are CASSIAN — a precise code analysis assistant for ${scope}.

## Response Rules

### Tone & Accuracy
- Open with one sentence that directly answers the question — no filler (no "Certainly", "Sure", "Of course", "Here is your answer").
- Be technical and concise. Reference exact file paths and function names.
- If the context doesn't contain enough to fully answer, state that honestly in one sentence.

### Formatting
- Use \`###\` for main section headers; \`####\` for sub-sections.
- Use bullet points (\`- item\`) for lists of features, options, or data points.
- Use numbered steps (\`1. 2. 3.\`) ONLY for sequential instructions.
- Use \`---\` to separate major sections in long responses.
- **Bold** critical warnings and key takeaways.
- Use \`inline code\` for file paths, function names, and technical identifiers.
- Wrap all code examples in fenced code blocks with the correct language tag.
- Use **4-space indentation** in all code examples.
- Put the file path as a single-line comment on the **first line** of every code block: \`// path/to/file.ts\`.${archSection}

### Source Code Context
${contextBlocks}

---
Query: "${question}"`;
}

function buildDocumentationPrompt(question: string, contextBlocks: string, projectName?: string, archData?: Record<string, unknown>): string {
  const scope = projectName ? `"${projectName}"` : "a project";
  const archSection = archData
    ? `\n### Architecture Metadata\n- Type: ${archData.type}\n- Entry points: ${(archData.entryPoints as string[] | undefined)?.join(", ") || "unknown"}\n- Description: ${archData.description}`
    : "";

  return `You are CASSIAN — a code documentation assistant for ${scope}.

The user wants to understand the project structure. Produce a clear, intern-friendly explanation using the structure below.

## Required Sections (use these exact headers)

### What This Project Does
1–2 sentences. Plain English, no jargon. What problem does it solve?

### Entry Points
- List the main files a developer opens first (e.g. \`app/page.tsx\`, \`main.ts\`, \`index.js\`).
- Include how to run or build the project if apparent from the code.

### Key Modules & Responsibilities
- One bullet per major directory or module.
- Format: \`path/to/module\` — what it does.

### Data Flow
- Numbered steps showing how a user action travels through the system.
- Keep it high-level: User → Component → API → Service → Database.

---

## Formatting Rules
- Open with a 1-sentence summary before diving into sections.
- Use bullet points for lists; numbered steps ONLY for sequences.
- **Bold** UI elements and critical warnings.
- Use \`inline code\` for all file paths and identifiers.
- Use \`---\` between major sections.
- Do NOT start with "Certainly", "Sure", or any filler phrase.${archSection}

### Source Code Context (key files)
${contextBlocks}

---
Query: "${question}"`;
}

// ── Public API ───────────────────────────────────────────────

export async function askQuestion(projectId: string, question: string): Promise<ChatResponse> {
  // ── Step 1: Rule-based check ─────────────────────────────
  const rule = matchRule(question);
  if (rule) {
    return { repoId: projectId, question, answer: rule.answer, chunksUsed: 0, modelUsed: "rule-based" };
  }

  // ── Step 2: Load project from Firestore ──────────────────
  const projectDoc = await db.collection(PROJECTS_COLLECTION).doc(projectId).get();
  if (!projectDoc.exists) {
    throw new Error(`Project ${projectId} not found. Please re-upload your code.`);
  }

  const projectData = projectDoc.data()!;
  const projectName: string = projectData.name || "Unknown";
  const graph = projectData.graph as { nodes: GraphNode[]; edges: GraphEdge[] } | null | undefined;
  const queryTokens = tokenise(question);

  // ── Step 2.5: Blast Radius analysis ──────────────────────
  // Must run before path A/B/C so impact queries short-circuit here.
  if (detectBlastRadiusIntent(question) && graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const targetName = extractBlastRadiusTarget(question);
    if (targetName) {
      const { targetNodeId, affectedNodeIds, affectedPaths } = computeBlastRadius(
        graph.nodes, graph.edges ?? [], targetName
      );

      if (affectedPaths.length > 0) {
        const list = affectedPaths.map((p) => `- \`${p}\``).join("\n");
        const answer =
          `### Impact Analysis: \`${targetName}\`\n\n` +
          `Modifying \`${targetName}\` has a **blast radius of ${affectedPaths.length} file${affectedPaths.length === 1 ? "" : "s"}**.\n\n` +
          `### Affected Files\n\n` +
          `These files directly or transitively depend on \`${targetName}\`:\n\n` +
          `${list}\n\n---\n\n` +
          `*Any change to \`${targetName}\`'s exported API, types, or module structure requires updates in the files above. Red nodes are highlighted in the Impact Graph.*`;

        console.log(`[CHAT BLAST] target="${targetName}" → ${affectedPaths.length} affected files`);

        return {
          repoId: projectId, question, answer,
          chunksUsed: 0, modelUsed: "graph-analysis",
          blastRadius: { targetNodeId, affectedNodeIds, affectedPaths },
        };
      }
    }
  }

  // ── Step 3: Classify intent ──────────────────────────────
  const { isRetrieval, targetFile } = detectRetrievalIntent(question);
  const isDocumentation = !isRetrieval && detectDocumentationIntent(question);

  let files: FileContent[];

  // ── Path A: Exact file retrieval ─────────────────────────
  if (isRetrieval && targetFile) {
    console.log(`[CHAT RAG] Retrieval intent detected — searching for file: "${targetFile}"`);
    const exactFile = await findExactFile(projectId, targetFile);

    if (exactFile) {
      console.log(`[CHAT RAG] Found exact file: ${exactFile.filePath}`);
      const { blocks } = assembleContext([exactFile]);
      return {
        repoId: projectId,
        question,
        answer: (await callGeminiWithFallback(
          buildRetrievalPrompt(question, blocks, projectName),
          `\`\`\`\n// File not found: ${targetFile}\n\`\`\``,
          { temperature: 0.1, maxOutputTokens: 4096 }
        )).text,
        chunksUsed: 1,
        modelUsed: "gemini-2.0-flash",
      };
    }
    // Fall through to graph-RAG if exact file not found
    console.log(`[CHAT RAG] Exact file not found, falling back to graph search`);
  }

  // ── Path B: Documentation / architecture query ───────────
  if (isDocumentation) {
    console.log(`[CHAT RAG] Documentation intent detected for project=${projectId}`);
    // Fetch entry point files + keyword-scored files
    files = await fetchAndScoreAllFiles(projectId, queryTokens, question);
    const { blocks, fileCount } = assembleContext(files.slice(0, 8));

    const result = await callGeminiWithFallback(
      buildDocumentationPrompt(question, blocks, projectName, projectData.architectureData as Record<string, unknown> | undefined),
      "I couldn't generate project documentation. Try asking about a specific file or function.",
      { temperature: 0.3, maxOutputTokens: 4096 }
    );

    return { repoId: projectId, question, answer: result.text, chunksUsed: fileCount, modelUsed: result.model };
  }

  // ── Path C: Graph-RAG traversal (normal queries) ─────────
  if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const relevantFileIds = traverseGraph(graph.nodes, graph.edges || [], queryTokens, question);
    console.log(`[CHAT RAG] Graph traversal: ${relevantFileIds.size} relevant file IDs`);

    if (relevantFileIds.size > 0) {
      console.log(`[CHAT RAG] Fetching: [${Array.from(relevantFileIds).join(", ")}]`);
      files = await fetchFilesByIds(projectId, relevantFileIds);
    } else {
      console.log(`[CHAT RAG] Graph returned no results, keyword fallback`);
      files = await fetchAndScoreAllFiles(projectId, queryTokens, question);
    }
  } else {
    console.log(`[CHAT RAG] No graph for project=${projectId}, keyword search`);
    files = await fetchAndScoreAllFiles(projectId, queryTokens, question);
  }

  console.log(`[CHAT RAG] Fetched ${files.length} files`);

  const { blocks: contextBlocks, fileCount } = assembleContext(files);

  if (fileCount === 0) {
    return {
      repoId: projectId, question,
      answer: "No code files found in this project. The project may still be processing.",
      chunksUsed: 0, modelUsed: "fallback",
    };
  }

  // Retrieval intent but no specific file found → use retrieval prompt style
  const promptFn = isRetrieval
    ? buildRetrievalPrompt(question, contextBlocks, projectName)
    : buildExplainPrompt(question, contextBlocks, projectName);

  const result = await callGeminiWithFallback(
    promptFn,
    "I'm unable to reach the AI service right now. Please try again in a moment.",
    { temperature: isRetrieval ? 0.1 : 0.4, maxOutputTokens: 4096 }
  );

  console.log(`[chatService] model=${result.model} project=${projectId} files=${fileCount}`);

  return { repoId: projectId, question, answer: result.text, chunksUsed: fileCount, modelUsed: result.model };
}
