import type { ParsedFile, FileChunk } from "@/types";

/**
 * Validate a normalized project structure
 *
 * Ensures:
 * - Files array exists and has at least one file
 * - Every file has required fields (path, content, extension)
 * - No binary content
 * - No null/undefined values in critical fields
 *
 * Throws an error if validation fails
 */
export function validateProject(project: {
  files: ParsedFile[];
  chunks: FileChunk[];
  fileCount: number;
  chunkCount: number;
}): void {
  // Check files array exists
  if (!project.files) {
    throw new Error("Invalid project format: missing 'files' array");
  }

  // Check files array is not empty
  if (!Array.isArray(project.files)) {
    throw new Error("Invalid project format: 'files' must be an array");
  }

  if (project.files.length === 0) {
    throw new Error("Invalid project format: 'files' array is empty");
  }

  // Validate each file
  for (let i = 0; i < project.files.length; i++) {
    const file = project.files[i];

    // Check file is an object
    if (!file || typeof file !== "object") {
      throw new Error(`Invalid project format: file at index ${i} is not an object`);
    }

    // Check required fields exist
    if (!file.path || typeof file.path !== "string") {
      throw new Error(`Invalid project format: file at index ${i} missing 'path'`);
    }

    if (file.content === null || file.content === undefined || typeof file.content !== "string") {
      throw new Error(`Invalid project format: file '${file.path}' missing 'content'`);
    }

    if (!file.extension || typeof file.extension !== "string") {
      throw new Error(`Invalid project format: file '${file.path}' missing 'extension'`);
    }

    // Check content is not empty
    if (file.content.trim().length === 0) {
      throw new Error(`Invalid project format: file '${file.path}' has empty content`);
    }

    // Check for binary content (null bytes)
    const checkLen = Math.min(file.content.length, 1000);
    for (let j = 0; j < checkLen; j++) {
      if (file.content.charCodeAt(j) === 0) {
        throw new Error(`Invalid project format: file '${file.path}' contains binary content`);
      }
    }

    // Check language exists
    if (!file.language || typeof file.language !== "string") {
      throw new Error(`Invalid project format: file '${file.path}' missing 'language'`);
    }

    // Check sizeBytes is a number
    if (typeof file.sizeBytes !== "number" || file.sizeBytes <= 0) {
      throw new Error(`Invalid project format: file '${file.path}' has invalid 'sizeBytes'`);
    }
  }

  // Validate chunks
  if (!project.chunks || !Array.isArray(project.chunks)) {
    throw new Error("Invalid project format: missing or invalid 'chunks' array");
  }

  if (project.chunks.length === 0) {
    throw new Error("Invalid project format: 'chunks' array is empty");
  }

  // Validate counts
  if (typeof project.fileCount !== "number" || project.fileCount !== project.files.length) {
    throw new Error("Invalid project format: 'fileCount' does not match actual file count");
  }

  if (typeof project.chunkCount !== "number" || project.chunkCount !== project.chunks.length) {
    throw new Error("Invalid project format: 'chunkCount' does not match actual chunk count");
  }

  // All checks passed
  console.log(`✓ Project validation passed: ${project.fileCount} files, ${project.chunkCount} chunks`);
}
