import type { ParsedFile } from "@/types";

// ──────────────────────────────────────────────
// Graph Type Definitions
// ──────────────────────────────────────────────

export type NodeType = "file" | "function" | "class" | "module";
export type EdgeType = "imports" | "calls" | "defines" | "references";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  fileId?: string;
  path: string;
  metadata?: {
    language?: string;
    lineStart?: number;
    lineEnd?: number;
  };
}

export interface GraphEdge {
  id: string;
  from: string; // node ID
  to: string; // node ID
  type: EdgeType;
  metadata?: {
    lineNumber?: number;
  };
}

export interface CodeGraph {
  projectId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    functionCount: number;
    classCount: number;
  };
}

// ──────────────────────────────────────────────
// Configuration & Safety
// ──────────────────────────────────────────────

const MAX_NODES_PER_FILE = 500;
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.min\.js$/,
  /\.bundle\.js$/,
  /dist\//,
  /build\//,
  /\.map$/,
];

function shouldIgnoreFile(path: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(path));
}

// ──────────────────────────────────────────────
// Node ID Generation
// ──────────────────────────────────────────────

function generateNodeId(type: NodeType, path: string, name: string): string {
  return `${type}:${path}:${name}`;
}

function generateEdgeId(from: string, to: string, type: EdgeType): string {
  return `${type}:${from}->${to}`;
}

// ──────────────────────────────────────────────
// File Node Extraction
// ──────────────────────────────────────────────

function extractFileNode(file: ParsedFile, fileIdMap?: Record<string, string>): GraphNode {
  const resolvedFileId = fileIdMap?.[file.path] ?? file.id ?? null;
  const node: GraphNode = {
    id: generateNodeId("file", file.path, file.path),
    type: "file",
    name: file.path,
    path: file.path,
    metadata: {
      language: file.language,
    },
  };
  if (resolvedFileId) node.fileId = resolvedFileId;
  return node;
}

// ──────────────────────────────────────────────
// Import Detection & Edge Extraction
// ──────────────────────────────────────────────

const IMPORT_PATTERNS = [
  // ES6 imports
  /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
  // CommonJS require
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Dynamic imports
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // TypeScript imports
  /import\s+type\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
];

function extractImports(content: string, sourceFile: ParsedFile): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const foundImports = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      // Skip node_modules imports (keep only relative imports for now)
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        continue;
      }

      // Avoid duplicates
      if (foundImports.has(importPath)) {
        continue;
      }
      foundImports.add(importPath);

      const fromNodeId = generateNodeId("file", sourceFile.path, sourceFile.path);
      const toNodeId = generateNodeId("file", importPath, importPath);

      edges.push({
        id: generateEdgeId(fromNodeId, toNodeId, "imports"),
        from: fromNodeId,
        to: toNodeId,
        type: "imports",
      });
    }
  }

  return edges;
}

// ──────────────────────────────────────────────
// Function Detection & Node Extraction
// ──────────────────────────────────────────────

const FUNCTION_PATTERNS = [
  // Regular function declarations
  /function\s+(\w+)\s*\(/g,
  // Arrow functions assigned to const/let/var
  /(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
  // Arrow functions without parens
  /(?:const|let|var)\s+(\w+)\s*=\s*\w+\s*=>/g,
  // Class methods
  /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g,
  // Export function
  /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g,
  // Export arrow function
  /export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>/g,
];

function extractFunctions(content: string, file: ParsedFile, fileIdMap?: Record<string, string>): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const foundFunctions = new Set<string>();
  const resolvedFileId = fileIdMap?.[file.path] ?? file.id ?? null;

  for (const pattern of FUNCTION_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const functionName = match[1];

      // Skip common non-function matches
      if (['if', 'while', 'for', 'switch', 'catch'].includes(functionName)) {
        continue;
      }

      // Avoid duplicates
      if (foundFunctions.has(functionName)) {
        continue;
      }
      foundFunctions.add(functionName);

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      const functionNodeId = generateNodeId("function", file.path, functionName);

      const fnNode: GraphNode = {
        id: functionNodeId,
        type: "function",
        name: functionName,
        path: file.path,
        metadata: {
          language: file.language,
          lineStart: lineNumber,
        },
      };
      if (resolvedFileId) fnNode.fileId = resolvedFileId;
      nodes.push(fnNode);

      // Create "defines" edge from file to function
      const fileNodeId = generateNodeId("file", file.path, file.path);
      edges.push({
        id: generateEdgeId(fileNodeId, functionNodeId, "defines"),
        from: fileNodeId,
        to: functionNodeId,
        type: "defines",
        metadata: {
          lineNumber,
        },
      });
    }
  }

  return { nodes, edges };
}

// ──────────────────────────────────────────────
// Class Detection & Node Extraction
// ──────────────────────────────────────────────

const CLASS_PATTERNS = [
  // Class declarations
  /class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/g,
  // Export class
  /export\s+(?:default\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/g,
];

function extractClasses(content: string, file: ParsedFile, fileIdMap?: Record<string, string>): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const foundClasses = new Set<string>();
  const resolvedFileId = fileIdMap?.[file.path] ?? file.id ?? null;

  for (const pattern of CLASS_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const className = match[1];

      // Avoid duplicates
      if (foundClasses.has(className)) {
        continue;
      }
      foundClasses.add(className);

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      const classNodeId = generateNodeId("class", file.path, className);

      const clsNode: GraphNode = {
        id: classNodeId,
        type: "class",
        name: className,
        path: file.path,
        metadata: {
          language: file.language,
          lineStart: lineNumber,
        },
      };
      if (resolvedFileId) clsNode.fileId = resolvedFileId;
      nodes.push(clsNode);

      // Create "defines" edge from file to class
      const fileNodeId = generateNodeId("file", file.path, file.path);
      edges.push({
        id: generateEdgeId(fileNodeId, classNodeId, "defines"),
        from: fileNodeId,
        to: classNodeId,
        type: "defines",
        metadata: {
          lineNumber,
        },
      });
    }
  }

  return { nodes, edges };
}

// ──────────────────────────────────────────────
// Function Call Detection (Basic)
// ──────────────────────────────────────────────

function extractFunctionCalls(
  content: string,
  file: ParsedFile,
  allFunctions: Set<string>
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const foundCalls = new Set<string>();

  // Simple pattern: functionName(
  const callPattern = /(\w+)\s*\(/g;

  let match;
  while ((match = callPattern.exec(content)) !== null) {
    const calledFunction = match[1];

    // Only create edges if the function exists in our graph
    if (!allFunctions.has(calledFunction)) {
      continue;
    }

    // Avoid duplicate edges
    const callKey = `${file.path}->${calledFunction}`;
    if (foundCalls.has(callKey)) {
      continue;
    }
    foundCalls.add(callKey);

    const fromNodeId = generateNodeId("file", file.path, file.path);
    const toNodeId = generateNodeId("function", file.path, calledFunction);

    edges.push({
      id: generateEdgeId(fromNodeId, toNodeId, "calls"),
      from: fromNodeId,
      to: toNodeId,
      type: "calls",
    });
  }

  return edges;
}

// ──────────────────────────────────────────────
// Main Graph Builder
// ──────────────────────────────────────────────

export async function buildGraph(
  projectId: string,
  files: ParsedFile[],
  fileIdMap?: Record<string, string>
): Promise<CodeGraph> {
  console.log(`\n🔍 [GRAPH BUILD START] Project: ${projectId}, Files: ${files.length}`);

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const allFunctionNames = new Set<string>();

  let filesAnalyzed = 0;
  let filesSkipped = 0;

  // Pass 1: Extract file nodes, functions, classes, and imports
  for (const file of files) {
    try {
      // Skip ignored files
      if (shouldIgnoreFile(file.path)) {
        filesSkipped++;
        continue;
      }

      // Skip large files (safety)
      if (file.sizeBytes > 1_000_000) {
        console.log(`⚠️  [GRAPH] Skipping large file: ${file.path} (${file.sizeBytes} bytes)`);
        filesSkipped++;
        continue;
      }

      filesAnalyzed++;

      // Extract file node (fileIdMap resolves the real Firestore doc ID)
      const fileNode = extractFileNode(file, fileIdMap);
      allNodes.push(fileNode);

      // Extract imports
      const importEdges = extractImports(file.content, file);
      allEdges.push(...importEdges);

      // Extract functions
      const { nodes: functionNodes, edges: functionEdges } = extractFunctions(file.content, file, fileIdMap);
      allNodes.push(...functionNodes);
      allEdges.push(...functionEdges);

      // Track function names for call detection
      functionNodes.forEach(fn => allFunctionNames.add(fn.name));

      // Extract classes
      const { nodes: classNodes, edges: classEdges } = extractClasses(file.content, file, fileIdMap);
      allNodes.push(...classNodes);
      allEdges.push(...classEdges);

      // Safety check: prevent node explosion
      const fileNodeCount = 1 + functionNodes.length + classNodes.length;
      if (fileNodeCount > MAX_NODES_PER_FILE) {
        console.warn(
          `⚠️  [GRAPH] File ${file.path} has ${fileNodeCount} nodes (limit: ${MAX_NODES_PER_FILE}), truncating...`
        );
        // Truncate nodes if needed
        const truncateAt = allNodes.length - (fileNodeCount - MAX_NODES_PER_FILE);
        allNodes.splice(truncateAt);
      }
    } catch (error) {
      console.error(`❌ [GRAPH] Error processing file ${file.path}:`, error);
      // Continue processing other files
    }
  }

  // Pass 2: Extract function calls (basic)
  for (const file of files) {
    try {
      if (shouldIgnoreFile(file.path) || file.sizeBytes > 1_000_000) {
        continue;
      }

      const callEdges = extractFunctionCalls(file.content, file, allFunctionNames);
      allEdges.push(...callEdges);
    } catch (error) {
      console.error(`❌ [GRAPH] Error extracting calls from ${file.path}:`, error);
    }
  }

  // Remove duplicate edges
  const uniqueEdges = Array.from(
    new Map(allEdges.map(edge => [edge.id, edge])).values()
  );

  // Calculate stats
  const fileCount = allNodes.filter(n => n.type === "file").length;
  const functionCount = allNodes.filter(n => n.type === "function").length;
  const classCount = allNodes.filter(n => n.type === "class").length;

  console.log(`✅ [GRAPH BUILD COMPLETE]`);
  console.log(`   Files Analyzed: ${filesAnalyzed}`);
  console.log(`   Files Skipped: ${filesSkipped}`);
  console.log(`   Nodes Created: ${allNodes.length} (${fileCount} files, ${functionCount} functions, ${classCount} classes)`);
  console.log(`   Edges Created: ${uniqueEdges.length}`);

  return {
    projectId,
    nodes: allNodes,
    edges: uniqueEdges,
    stats: {
      nodeCount: allNodes.length,
      edgeCount: uniqueEdges.length,
      fileCount,
      functionCount,
      classCount,
    },
  };
}

// ──────────────────────────────────────────────
// File-Tree Fallback Graph Builder
// ──────────────────────────────────────────────

/**
 * Builds a minimal, guaranteed graph from the file list and dependency map.
 * Used as a fallback when the AI-based graph builder fails.
 *
 * Nodes  — one "file" node per file, one "module" node per unique directory
 * Edges  — "references" (structure): directory → contained file/sub-directory
 *        — "imports"    (dependency): file → file, sourced from the dep map
 */
export function buildFileTreeGraph(
  projectId: string,
  files: ParsedFile[],
  dependencies?: Record<string, string[]>,
  fileIdMap?: Record<string, string>
): CodeGraph {
  console.log(`\n🌲 [FILE-TREE GRAPH] Building fallback graph for project ${projectId} (${files.length} files)`);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const filePathSet = new Set(files.map(f => f.path));

  // ── 1. Collect unique directory paths ───────────────────────
  const dirSet = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  }

  // ── 2. Create module nodes for directories ───────────────────
  for (const dir of dirSet) {
    nodes.push({
      id: `module:${dir}:${dir}`,
      type: "module",
      name: dir.split("/").pop() || dir,
      path: dir,
    });
  }

  // ── 3. Create file nodes ─────────────────────────────────────
  for (const file of files) {
    const fileNode: GraphNode = {
      id: `file:${file.path}:${file.path}`,
      type: "file",
      name: file.path.split("/").pop() || file.path,
      path: file.path,
      metadata: { language: file.language },
    };
    // Resolve the real Firestore doc ID — never write undefined to Firestore
    const fid = fileIdMap?.[file.path] ?? file.id ?? null;
    if (fid) fileNode.fileId = fid;
    nodes.push(fileNode);
  }

  // ── 4. Structure edges: dir → child dir / dir → file ─────────
  for (const file of files) {
    const parts = file.path.split("/");
    if (parts.length > 1) {
      const parentDir = parts.slice(0, -1).join("/");
      edges.push({
        id: `references:module:${parentDir}:${parentDir}->file:${file.path}:${file.path}`,
        from: `module:${parentDir}:${parentDir}`,
        to: `file:${file.path}:${file.path}`,
        type: "references",
      });
    }
  }

  for (const dir of dirSet) {
    const parts = dir.split("/");
    if (parts.length > 1) {
      const parentDir = parts.slice(0, -1).join("/");
      if (dirSet.has(parentDir)) {
        edges.push({
          id: `references:module:${parentDir}:${parentDir}->module:${dir}:${dir}`,
          from: `module:${parentDir}:${parentDir}`,
          to: `module:${dir}:${dir}`,
          type: "references",
        });
      }
    }
  }

  // ── 5. Dependency edges: file → file (from import/require map) ─
  if (dependencies) {
    for (const [fromPath, imports] of Object.entries(dependencies)) {
      if (!filePathSet.has(fromPath)) continue;
      const fromId = `file:${fromPath}:${fromPath}`;

      for (const importPath of imports) {
        if (!filePathSet.has(importPath)) continue;
        const toId = `file:${importPath}:${importPath}`;
        edges.push({
          id: `imports:${fromId}->${toId}`,
          from: fromId,
          to: toId,
          type: "imports",
        });
      }
    }
  }

  const uniqueEdges = Array.from(new Map(edges.map(e => [e.id, e])).values());
  const fileCount = nodes.filter(n => n.type === "file").length;

  console.log(`✅ [FILE-TREE GRAPH] Built: ${nodes.length} nodes, ${uniqueEdges.length} edges`);

  return {
    projectId,
    nodes,
    edges: uniqueEdges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: uniqueEdges.length,
      fileCount,
      functionCount: 0,
      classCount: 0,
    },
  };
}

// ──────────────────────────────────────────────
// Graph Merging (for append mode)
// ──────────────────────────────────────────────

export function mergeGraphs(existing: CodeGraph, newGraph: CodeGraph): CodeGraph {
  console.log(`\n🔗 [GRAPH MERGE] Merging existing (${existing.nodes.length} nodes) with new (${newGraph.nodes.length} nodes)`);

  // Create maps for deduplication
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  // Add existing nodes
  for (const node of existing.nodes) {
    nodeMap.set(node.id, node);
  }

  // Add new nodes (overwrite if same ID)
  for (const node of newGraph.nodes) {
    nodeMap.set(node.id, node);
  }

  // Add existing edges
  for (const edge of existing.edges) {
    edgeMap.set(edge.id, edge);
  }

  // Add new edges (overwrite if same ID)
  for (const edge of newGraph.edges) {
    edgeMap.set(edge.id, edge);
  }

  const mergedNodes = Array.from(nodeMap.values());
  const mergedEdges = Array.from(edgeMap.values());

  // Recalculate stats
  const fileCount = mergedNodes.filter(n => n.type === "file").length;
  const functionCount = mergedNodes.filter(n => n.type === "function").length;
  const classCount = mergedNodes.filter(n => n.type === "class").length;

  console.log(`✅ [GRAPH MERGE COMPLETE] Result: ${mergedNodes.length} nodes, ${mergedEdges.length} edges`);

  return {
    projectId: existing.projectId,
    nodes: mergedNodes,
    edges: mergedEdges,
    stats: {
      nodeCount: mergedNodes.length,
      edgeCount: mergedEdges.length,
      fileCount,
      functionCount,
      classCount,
    },
  };
}
