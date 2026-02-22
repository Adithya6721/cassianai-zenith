"use server";

import { getAdminFirestore } from "@/lib/firebaseAdmin";
import type { Project, ProjectSource, ParsedFile, FileChunk, ProjectArchitecture } from "@/types";
import { getGraphSummary, deleteGraph } from "./graphStore";

const db = getAdminFirestore();
const PROJECTS_COLLECTION = "projects";
const FILES_SUBCOLLECTION = "files";

/**
 * Create a new code project with subcollection-based file storage
 */
export async function createProject(params: {
  userId: string;
  name: string;
  type: ProjectSource;
  files: ParsedFile[];
  fileCount: number;
  chunkCount: number;
  chunks?: FileChunk[];
  dependencies?: Record<string, string[]>;
  architectureData?: ProjectArchitecture;
  source?: ProjectSource;
  githubUrl?: string;
  rawCode?: string;
  summary?: string;
  architecture?: string;
}): Promise<{ projectId: string; fileIdMap: Record<string, string> }> {
  // Create project metadata (no files array)
  const projectRef = db.collection(PROJECTS_COLLECTION).doc();
  const projectId = projectRef.id;

  const projectData = {
    userId: params.userId,
    name: params.name,
    type: params.type,
    fileCount: params.fileCount,
    chunkCount: params.chunkCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dependencies: params.dependencies || {},
    architectureData: params.architectureData || null,
    // Always initialize graph so the Firestore field exists from day one
    graph: { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, fileCount: 0, functionCount: 0, classCount: 0 }, updatedAt: Date.now() },
    // Legacy fields
    source: params.source || params.type,
    githubUrl: params.githubUrl || null,
    rawCode: params.rawCode || null,
    summary: params.summary || null,
    architecture: params.architecture || null,
  };

  await projectRef.set(projectData);

  // Store each file as separate document in subcollection and build fileIdMap
  const filesRef = projectRef.collection(FILES_SUBCOLLECTION);
  const batch = db.batch();
  const fileIdMap: Record<string, string> = {};

  for (const file of params.files) {
    const fileDocRef = filesRef.doc();
    // Record the Firestore-assigned ID for this file path before committing
    fileIdMap[file.path] = fileDocRef.id;
    batch.set(fileDocRef, {
      fileName: file.path.split('/').pop() || file.path,
      filePath: file.path,
      language: file.language,
      content: file.content,
      size: file.content.length,
      createdAt: Date.now(),
    });
  }

  await batch.commit();

  console.log(`✅ [FIRESTORE] Project created: ID=${projectId}, name="${params.name}", files=${params.fileCount}`);
  console.log(`✅ [FIRESTORE] Stored ${params.files.length} files in subcollection`);

  return { projectId, fileIdMap };
}

/**
 * Get all projects for a specific user (metadata only)
 */
export async function getProjects(userId: string): Promise<Project[]> {
  const snapshot = await db
    .collection(PROJECTS_COLLECTION)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  const projects: Project[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Fetch files from subcollection
    const filesSnapshot = await db
      .collection(PROJECTS_COLLECTION)
      .doc(doc.id)
      .collection(FILES_SUBCOLLECTION)
      .get();

    const files: ParsedFile[] = filesSnapshot.docs.map(fileDoc => {
      const fileData = fileDoc.data();
      return {
        id: fileDoc.id,
        path: fileData.filePath,
        language: fileData.language,
        content: fileData.content,
        extension: fileData.filePath.split('.').pop() || '',
        sizeBytes: fileData.size || fileData.content.length,
      };
    });

    // Fetch graph summary (non-blocking)
    let graphSummary;
    try {
      graphSummary = await getGraphSummary(doc.id);
    } catch (error) {
      console.error(`⚠️  [GRAPH] Failed to fetch graph summary for project ${doc.id}:`, error);
      graphSummary = undefined;
    }

    // Debug: Check graph field
    console.log(`🔍 [DEBUG GRAPH FETCH] Project ${doc.id} - graph field exists: ${!!data.graph}`);
    if (data.graph) {
      console.log(`🔍 [DEBUG GRAPH FETCH] Project ${doc.id} - graph has ${data.graph.nodes?.length || 0} nodes, ${data.graph.edges?.length || 0} edges`);
    }

    projects.push({
      id: doc.id,
      userId: data.userId,
      name: data.name,
      type: data.type as ProjectSource,
      files: files,
      fileCount: files.length,
      chunkCount: data.chunkCount || 0,
      createdAt: typeof data.createdAt === "number"
        ? new Date(data.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: data.updatedAt
        ? (typeof data.updatedAt === "number" ? new Date(data.updatedAt).toISOString() : undefined)
        : undefined,
      dependencies: data.dependencies || undefined,
      architectureData: data.architectureData || undefined,
      graph: data.graph || undefined,
      graphSummary: graphSummary || undefined,
      // Legacy fields
      source: data.source || data.type as ProjectSource,
      githubUrl: data.githubUrl || undefined,
      rawCode: data.rawCode || undefined,
      parsedFiles: files,
      chunks: [],
      summary: data.summary || undefined,
      architecture: data.architecture || undefined,
    });
  }

  console.log(`📥 [FIRESTORE] Loaded ${projects.length} projects for user ${userId.substring(0, 8)}...`);

  return projects;
}

/**
 * Get a single project by ID with all files from subcollection
 */
export async function getProjectById(projectId: string): Promise<Project | null> {
  const docRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.log(`❌ [FIRESTORE] Project not found: ID=${projectId}`);
    return null;
  }

  const data = docSnap.data();
  if (!data) return null;

  // Fetch all files from subcollection
  const filesSnapshot = await docRef.collection(FILES_SUBCOLLECTION).get();

  const files: ParsedFile[] = filesSnapshot.docs.map(fileDoc => {
    const fileData = fileDoc.data();
    return {
      id: fileDoc.id,
      path: fileData.filePath,
      language: fileData.language,
      content: fileData.content,
      extension: fileData.filePath.split('.').pop() || '',
      sizeBytes: fileData.size || fileData.content.length,
    };
  });

  // Fetch graph summary (non-blocking)
  let graphSummary;
  try {
    graphSummary = await getGraphSummary(projectId);
  } catch (error) {
    console.error(`⚠️  [GRAPH] Failed to fetch graph summary for project ${projectId}:`, error);
    graphSummary = undefined;
  }

  // Debug: Check graph field
  console.log(`🔍 [DEBUG GRAPH FETCH BY ID] Project ${projectId} - graph field exists: ${!!data.graph}`);
  if (data.graph) {
    console.log(`🔍 [DEBUG GRAPH FETCH BY ID] Project ${projectId} - graph has ${data.graph.nodes?.length || 0} nodes, ${data.graph.edges?.length || 0} edges`);
  }

  console.log(`📄 [FIRESTORE] Project loaded: ID=${projectId}, name="${data.name}", files=${files.length}`);

  return {
    id: docSnap.id,
    userId: data.userId,
    name: data.name,
    type: data.type as ProjectSource,
    files: files,
    fileCount: files.length,
    chunkCount: data.chunkCount || 0,
    createdAt: typeof data.createdAt === "number"
      ? new Date(data.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: data.updatedAt
      ? (typeof data.updatedAt === "number" ? new Date(data.updatedAt).toISOString() : undefined)
      : undefined,
    dependencies: data.dependencies || undefined,
    architectureData: data.architectureData || undefined,
    graph: data.graph || undefined,
    graphSummary: graphSummary || undefined,
    // Legacy fields
    source: data.source || data.type as ProjectSource,
    githubUrl: data.githubUrl || undefined,
    rawCode: data.rawCode || undefined,
    parsedFiles: files,
    chunks: [],
    summary: data.summary || undefined,
    architecture: data.architecture || undefined,
  };
}

/**
 * Delete a project and all its files
 */
export async function deleteProject(projectId: string): Promise<void> {
  const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);

  // Delete all files in subcollection
  const filesSnapshot = await projectRef.collection(FILES_SUBCOLLECTION).get();

  const batch = db.batch();
  filesSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Delete project document
  batch.delete(projectRef);

  await batch.commit();

  console.log(`🗑️  [FIRESTORE] Project deleted: ID=${projectId} (including ${filesSnapshot.size} files)`);

  // Delete associated graph (non-blocking)
  await deleteGraph(projectId);
}

/**
 * Add files to existing project (append mode)
 */
export async function updateProject(params: {
  projectId: string;
  newFiles: ParsedFile[];
  newChunks: FileChunk[];
  dependencies: Record<string, string[]>;
  architectureData: ProjectArchitecture;
}): Promise<{ fileIdMap: Record<string, string> }> {
  console.log(`🔍 [DEBUG] Appending ${params.newFiles.length} files to project ${params.projectId}`);

  const projectRef = db.collection(PROJECTS_COLLECTION).doc(params.projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    throw new Error("Project not found");
  }

  const existingData = projectSnap.data();
  if (!existingData) {
    throw new Error("Project data is empty");
  }

  // Get existing file count
  const filesSnapshot = await projectRef.collection(FILES_SUBCOLLECTION).get();
  const existingFileCount = filesSnapshot.size;

  console.log(`🔍 [DEBUG] Project has ${existingFileCount} existing files`);

  // Add new files to subcollection, building fileIdMap as we go
  const filesRef = projectRef.collection(FILES_SUBCOLLECTION);
  const batch = db.batch();
  const fileIdMap: Record<string, string> = {};

  for (const file of params.newFiles) {
    const fileDocRef = filesRef.doc();
    fileIdMap[file.path] = fileDocRef.id;
    batch.set(fileDocRef, {
      fileName: file.path.split('/').pop() || file.path,
      filePath: file.path,
      language: file.language,
      content: file.content,
      size: file.content.length,
      createdAt: Date.now(),
    });
  }

  await batch.commit();

  // Merge dependencies
  const existingDeps = existingData.dependencies || {};
  const newDeps = params.dependencies || {};
  const mergedDependencies: Record<string, string[]> = {};

  const allDepKeys = new Set([
    ...Object.keys(existingDeps),
    ...Object.keys(newDeps),
  ]);

  for (const filePath of allDepKeys) {
    const existingImports = existingDeps[filePath] || [];
    const newImports = newDeps[filePath] || [];
    const mergedImports = Array.from(
      new Set([...existingImports, ...newImports])
    );
    mergedDependencies[filePath] = mergedImports;
  }

  // Merge architecture data
  const existingArch = existingData.architectureData;
  const newArch = params.architectureData;
  let mergedArchitecture: ProjectArchitecture;

  if (existingArch && newArch) {
    const mergedEntryPoints = Array.from(
      new Set([...(existingArch.entryPoints || []), ...(newArch.entryPoints || [])])
    );
    const mergedModules = Array.from(
      new Set([...(existingArch.modules || []), ...(newArch.modules || [])])
    );

    mergedArchitecture = {
      type: newArch.type || existingArch.type,
      entryPoints: mergedEntryPoints,
      modules: mergedModules,
      description: newArch.description || existingArch.description,
    };
  } else {
    mergedArchitecture = newArch || existingArch;
  }

  // Update project metadata
  await projectRef.update({
    fileCount: existingFileCount + params.newFiles.length,
    chunkCount: (existingData.chunkCount || 0) + params.newChunks.length,
    dependencies: mergedDependencies,
    architectureData: mergedArchitecture,
    updatedAt: Date.now(),
  });

  console.log(`✅ [FIRESTORE] Added ${params.newFiles.length} new files. Total: ${existingFileCount + params.newFiles.length}`);
  return { fileIdMap };
}
