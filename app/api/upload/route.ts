import { NextRequest, NextResponse } from "next/server";
import { loadRepo, cleanupRepo, createMultiFileTextProject } from "@/services/repoLoader";
import { listFiles, parseFiles } from "@/services/fileParser";
import { summarizeRepo } from "@/services/aiSummarizer";
import { saveRepo } from "@/services/repoStore";
import { normalizeProject } from "@/services/projectNormalizer";
import { validateProject } from "@/services/projectValidator";
import { getProjectById, updateProject, createProject } from "@/services/projectStore";
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from "@/lib/authHelper";
import { buildGraph, buildFileTreeGraph, mergeGraphs } from "@/services/graphBuilder";
import { storeGraph, getGraph } from "@/services/graphStore";
import type { ApiResponse, UploadResult, UploadSource, ParsedFile } from "@/types";

/**
 * Try to build an AI code graph; fall back to a file-tree graph on any error.
 * Always stores a graph so the Firestore document always has the field.
 */
async function buildAndStoreGraph(
  projectId: string,
  files: ParsedFile[],
  dependencies?: Record<string, string[]>,
  fileIdMap?: Record<string, string>
): Promise<void> {
  console.log(`\n🔍 [GRAPH] Building graph for project ${projectId} (${files.length} files)`);

  let graph;
  try {
    graph = await buildGraph(projectId, files, fileIdMap);
    console.log(`✅ [GRAPH] AI graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  } catch (aiErr) {
    console.warn(`⚠️  [GRAPH] AI graph failed — using file-tree fallback:`, aiErr instanceof Error ? aiErr.message : aiErr);
    graph = buildFileTreeGraph(projectId, files, dependencies, fileIdMap);
  }

  await storeGraph(projectId, graph);
  console.log(`✅ [GRAPH] Stored for project ${projectId}`);
}

/**
 * Full pipeline: load → parse → normalize → validate → summarize
 */
async function processRepo(
  source: UploadSource,
  payload: string | Buffer,
  fileName?: string
): Promise<{ result: UploadResult; localPath: string }> {
  const loaded = await loadRepo(source, payload, fileName);
  const files = await listFiles(loaded.localPath);
  const parsed = await parseFiles(loaded.localPath);

  console.log(`Processing ${source} upload: ${parsed.length} raw files`);

  // ── STEP 1: Normalize project (clean files, create chunks) ──
  const normalized = await normalizeProject(parsed, source);

  // ── STEP 2: Validate normalized project ──
  try {
    validateProject(normalized);
  } catch (error) {
    console.error("Project validation failed:", error);
    throw new Error(
      error instanceof Error ? error.message : "Project validation failed"
    );
  }

  console.log(`✓ Project normalized: ${normalized.fileCount} files`);
  console.log(`✓ Chunks created: ${normalized.chunkCount} chunks`);

  // AI summarisation (fails safely — returns fallback text on error)
  const summary = await summarizeRepo(
    loaded.repoId,
    loaded.repoName,
    normalized.chunks
  );

  // Persist chunks + summary in memory so /api/chat can use them
  saveRepo(loaded.repoId, loaded.repoName, normalized.chunks, summary);

  return {
    localPath: loaded.localPath,
    result: {
      repoId: loaded.repoId,
      repoName: loaded.repoName,
      source,
      fileCount: normalized.fileCount,
      chunkCount: normalized.chunkCount,
      files,
      parsedFiles: normalized.files, // Normalized files
      chunks: normalized.chunks,
      dependencies: normalized.dependencies,
      architectureData: normalized.architectureData,
      repoSummary: summary.overview,
      architecture: summary.architecture,
    },
  };
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<UploadResult>>> {
  let localPath: string | null = null;

  try {
    // ── STEP 1: Verify Authentication ──
    let authenticatedUserId: string;
    try {
      const { userId } = await verifyAuthToken(request);
      authenticatedUserId = userId;
      console.log(`Authenticated user: ${userId}`);
    } catch (error) {
      console.error("Authentication failed:", error);
      return unauthorizedResponse(
        error instanceof Error ? error.message : "Authentication failed"
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    // ── JSON body (GitHub URL or TEXT upload) ──────────────
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        github_url?: string;
        rawText?: string;
        textFiles?: Array<{ fileName: string; code: string }>;
        name?: string;
        mode?: "create" | "append";
        projectId?: string;
      };

      const mode = body.mode || "create";

      // ── APPEND MODE: Add files to existing project ──
      if (mode === "append") {
        console.log(`🔍 [DEBUG] APPEND MODE triggered for projectId: ${body.projectId}`);

        if (!body.projectId) {
          return NextResponse.json(
            { success: false, error: "Missing `projectId` for append mode" },
            { status: 400 }
          );
        }

        // Load existing project
        console.log(`🔍 [DEBUG] Loading existing project: ${body.projectId}`);
        const existingProject = await getProjectById(body.projectId);

        console.log(`🔍 [DEBUG] Existing project loaded: ${existingProject ? 'YES' : 'NO'}`);
        if (existingProject) {
          console.log(`🔍 [DEBUG] Existing project has ${existingProject.files?.length || 0} files, ${existingProject.chunks?.length || 0} chunks`);
        }

        if (!existingProject) {
          return NextResponse.json(
            { success: false, error: "Project not found" },
            { status: 404 }
          );
        }

        // Security: verify user owns the project (server-side check)
        if (existingProject.userId !== authenticatedUserId) {
          console.warn(
            `User ${authenticatedUserId} attempted to modify project ${body.projectId} owned by ${existingProject.userId}`
          );
          return forbiddenResponse("You don't have permission to modify this project");
        }

        // Process new files
        let result: UploadResult;
        let lp: string;

        if (body.textFiles && Array.isArray(body.textFiles) && body.textFiles.length > 0) {
          // Multi-file text upload
          const projectName = body.name || "text-upload";
          const loaded = await createMultiFileTextProject(body.textFiles, projectName);
          const files = await listFiles(loaded.localPath);
          const parsed = await parseFiles(loaded.localPath);

          console.log(`Processing multi-file TEXT append: ${parsed.length} raw files`);

          const normalized = await normalizeProject(parsed, "text");
          validateProject(normalized);

          const summary = await summarizeRepo(loaded.repoId, loaded.repoName, normalized.chunks);
          saveRepo(loaded.repoId, loaded.repoName, normalized.chunks, summary);

          lp = loaded.localPath;
          result = {
            repoId: loaded.repoId,
            repoName: loaded.repoName,
            source: "text",
            fileCount: normalized.fileCount,
            chunkCount: normalized.chunkCount,
            files,
            parsedFiles: normalized.files,
            chunks: normalized.chunks,
            dependencies: normalized.dependencies,
            architectureData: normalized.architectureData,
            repoSummary: summary.overview,
            architecture: summary.architecture,
          };
        } else if (body.rawText && typeof body.rawText === "string") {
          // Single-file text upload (backward compatibility)
          const { result: res, localPath: path } = await processRepo("text", body.rawText, body.name || "text-upload");
          result = res;
          lp = path;
        } else if (body.github_url && typeof body.github_url === "string") {
          const { result: res, localPath: path } = await processRepo("github", body.github_url);
          result = res;
          lp = path;
        } else {
          return NextResponse.json(
            { success: false, error: "Missing `github_url`, `rawText`, or `textFiles` for append mode" },
            { status: 400 }
          );
        }

        localPath = lp;

        console.log(`🔍 [DEBUG] Processed ${result.parsedFiles.length} new files, ${result.chunks.length} new chunks`);
        console.log(`🔍 [DEBUG] Calling updateProject to merge...`);

        // Merge files — captures real Firestore IDs for new files
        const { fileIdMap: appendFileIdMap } = await updateProject({
          projectId: body.projectId,
          newFiles: result.parsedFiles,
          newChunks: result.chunks,
          dependencies: result.dependencies,
          architectureData: result.architectureData,
        });

        console.log(`🔍 [DEBUG] updateProject completed successfully`);

        // Merge graph with real file IDs
        try {
          let newGraph;
          try {
            newGraph = await buildGraph(body.projectId, result.parsedFiles, appendFileIdMap);
          } catch {
            newGraph = buildFileTreeGraph(body.projectId, result.parsedFiles, result.dependencies, appendFileIdMap);
          }
          const existingGraph = await getGraph(body.projectId);
          const finalGraph = existingGraph ? mergeGraphs(existingGraph, newGraph) : newGraph;
          await storeGraph(body.projectId, finalGraph);
        } catch (graphError) {
          console.error(`⚠️  [GRAPH] Failed to merge graph for project ${body.projectId}:`, graphError);
        }

        return NextResponse.json({
          success: true,
          data: {
            ...result,
            message: "Files added to project successfully",
          },
        });
      }

      // ── CREATE MODE (default): Create new project ──
      // Multi-file TEXT upload
      if (body.textFiles && Array.isArray(body.textFiles) && body.textFiles.length > 0) {
        const projectName = body.name || "text-upload";

        const loaded = await createMultiFileTextProject(body.textFiles, projectName);
        const files = await listFiles(loaded.localPath);
        const parsed = await parseFiles(loaded.localPath);

        console.log(`Processing multi-file TEXT create: ${parsed.length} raw files`);

        const normalized = await normalizeProject(parsed, "text");
        validateProject(normalized);

        const summary = await summarizeRepo(loaded.repoId, loaded.repoName, normalized.chunks);
        saveRepo(loaded.repoId, loaded.repoName, normalized.chunks, summary);

        localPath = loaded.localPath;

        const result: UploadResult = {
          repoId: loaded.repoId,
          repoName: loaded.repoName,
          source: "text",
          fileCount: normalized.fileCount,
          chunkCount: normalized.chunkCount,
          files,
          parsedFiles: normalized.files,
          chunks: normalized.chunks,
          dependencies: normalized.dependencies,
          architectureData: normalized.architectureData,
          repoSummary: summary.overview,
          architecture: summary.architecture,
        };

        // Create project — returns real Firestore file IDs
        const { projectId: createdProjectId, fileIdMap } = await createProject({
          userId: authenticatedUserId,
          name: projectName,
          type: "text",
          files: result.parsedFiles,
          fileCount: result.fileCount,
          chunkCount: result.chunkCount,
          chunks: result.chunks,
          dependencies: result.dependencies,
          architectureData: result.architectureData,
          // Legacy fields
          source: "text",
          rawCode: body.textFiles.map(f => `// ${f.fileName}\n${f.code}`).join("\n\n"),
          summary: result.repoSummary,
          architecture: result.architecture,
        });

        await buildAndStoreGraph(createdProjectId, result.parsedFiles, result.dependencies, fileIdMap);

        return NextResponse.json({
          success: true,
          data: { ...result, projectId: createdProjectId },
        });
      }

      // Single-file TEXT upload with rawText (backward compatibility)
      if (body.rawText && typeof body.rawText === "string") {
        const projectName = body.name || "text-upload";

        const { result, localPath: lp } = await processRepo(
          "text",
          body.rawText,
          projectName
        );
        localPath = lp;

        // Create project — returns real Firestore file IDs
        const { projectId: createdProjectId, fileIdMap } = await createProject({
          userId: authenticatedUserId,
          name: projectName,
          type: "text",
          files: result.parsedFiles,
          fileCount: result.fileCount,
          chunkCount: result.chunkCount,
          chunks: result.chunks,
          dependencies: result.dependencies,
          architectureData: result.architectureData,
          // Legacy fields
          source: "text",
          rawCode: body.rawText,
          summary: result.repoSummary,
          architecture: result.architecture,
        });

        await buildAndStoreGraph(createdProjectId, result.parsedFiles, result.dependencies, fileIdMap);

        return NextResponse.json({
          success: true,
          data: { ...result, projectId: createdProjectId },
        });
      }

      // GitHub URL upload
      if (body.github_url && typeof body.github_url === "string") {
        const projectName = body.name || body.github_url.split("/").pop() || "github-project";

        const { result, localPath: lp } = await processRepo(
          "github",
          body.github_url
        );
        localPath = lp;

        // Create project — returns real Firestore file IDs
        const { projectId: createdProjectId, fileIdMap } = await createProject({
          userId: authenticatedUserId,
          name: projectName,
          type: "github",
          files: result.parsedFiles,
          fileCount: result.fileCount,
          chunkCount: result.chunkCount,
          chunks: result.chunks,
          dependencies: result.dependencies,
          architectureData: result.architectureData,
          // Legacy fields
          source: "github",
          githubUrl: body.github_url,
          summary: result.repoSummary,
          architecture: result.architecture,
        });

        await buildAndStoreGraph(createdProjectId, result.parsedFiles, result.dependencies, fileIdMap);

        return NextResponse.json({
          success: true,
          data: { ...result, projectId: createdProjectId },
        });
      }

      // No valid upload source provided
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required field. Provide either `github_url`, `rawText`, or `textFiles` with `name`.",
        },
        { status: 400 }
      );
    }

    // ── ZIP upload (multipart form-data) ────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const mode = (formData.get("mode") as string) || "create";
      const projectId = formData.get("projectId") as string | null;

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Missing `file` field in form data" },
          { status: 400 }
        );
      }

      const fileName = file instanceof File ? file.name : "upload.zip";

      if (!fileName.toLowerCase().endsWith(".zip")) {
        return NextResponse.json(
          { success: false, error: "Only .zip files are accepted" },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // ── APPEND MODE: Add files to existing project ──
      if (mode === "append") {
        console.log(`🔍 [DEBUG] ZIP APPEND MODE triggered for projectId: ${projectId}`);

        if (!projectId) {
          return NextResponse.json(
            { success: false, error: "Missing `projectId` for append mode" },
            { status: 400 }
          );
        }

        // Load existing project
        console.log(`🔍 [DEBUG] Loading existing project: ${projectId}`);
        const existingProject = await getProjectById(projectId);

        console.log(`🔍 [DEBUG] Existing project loaded: ${existingProject ? 'YES' : 'NO'}`);
        if (existingProject) {
          console.log(`🔍 [DEBUG] Existing project has ${existingProject.files?.length || 0} files, ${existingProject.chunks?.length || 0} chunks`);
        }

        if (!existingProject) {
          return NextResponse.json(
            { success: false, error: "Project not found" },
            { status: 404 }
          );
        }

        // Security: verify user owns the project (server-side check)
        if (existingProject.userId !== authenticatedUserId) {
          console.warn(
            `User ${authenticatedUserId} attempted to modify project ${projectId} owned by ${existingProject.userId}`
          );
          return forbiddenResponse("You don't have permission to modify this project");
        }

        // Process new files
        const { result, localPath: lp } = await processRepo("zip", buffer, fileName);
        localPath = lp;

        console.log(`🔍 [DEBUG] Processed ${result.parsedFiles.length} new files, ${result.chunks.length} new chunks from ZIP`);
        console.log(`🔍 [DEBUG] Calling updateProject to merge...`);

        // Merge files using updateProject — captures real Firestore IDs for new files
        const { fileIdMap: appendFileIdMap } = await updateProject({
          projectId,
          newFiles: result.parsedFiles,
          newChunks: result.chunks,
          dependencies: result.dependencies,
          architectureData: result.architectureData,
        });

        console.log(`🔍 [DEBUG] ZIP updateProject completed successfully`);

        // Merge graph with real file IDs from the append write
        try {
          let newGraph;
          try {
            newGraph = await buildGraph(projectId, result.parsedFiles, appendFileIdMap);
          } catch {
            newGraph = buildFileTreeGraph(projectId, result.parsedFiles, result.dependencies, appendFileIdMap);
          }
          const existingGraph = await getGraph(projectId);
          const finalGraph = existingGraph ? mergeGraphs(existingGraph, newGraph) : newGraph;
          await storeGraph(projectId, finalGraph);
        } catch (graphError) {
          console.error(`⚠️  [GRAPH] Failed to merge graph for project ${projectId}:`, graphError);
        }

        return NextResponse.json({
          success: true,
          data: {
            ...result,
            message: "Files added to project successfully",
          },
        });
      }

      // ── CREATE MODE (default): Create new project ──
      const projectName = formData.get("name") as string || fileName.replace(/\.zip$/i, "");

      const { result, localPath: lp } = await processRepo(
        "zip",
        buffer,
        fileName
      );
      localPath = lp;

      // Create project — returns real Firestore file IDs
      const { projectId: createdProjectId, fileIdMap } = await createProject({
        userId: authenticatedUserId,
        name: projectName,
        type: "zip",
        files: result.parsedFiles,
        fileCount: result.fileCount,
        chunkCount: result.chunkCount,
        chunks: result.chunks,
        dependencies: result.dependencies,
        architectureData: result.architectureData,
        // Legacy fields
        source: "zip",
        summary: result.repoSummary,
        architecture: result.architecture,
      });

      await buildAndStoreGraph(createdProjectId, result.parsedFiles, result.dependencies, fileIdMap);

      return NextResponse.json({
        success: true,
        data: { ...result, projectId: createdProjectId },
      });
    }

    // ── Unsupported content type ────────────────────────────
    return NextResponse.json(
      {
        success: false,
        error:
          "Unsupported Content-Type. Send JSON with `github_url` or `rawText`, or multipart form-data with a `file` field.",
      },
      { status: 415 }
    );
  } catch (err) {
    console.error("UPLOAD FULL ERROR:", err);
    const message =
      err instanceof Error ? err.message : "Unknown error during upload";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  } finally {
    if (localPath) {
      await cleanupRepo(localPath).catch(() => {});
    }
  }
}
