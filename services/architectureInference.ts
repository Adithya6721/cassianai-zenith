import type { ParsedFile, ProjectArchitecture } from "@/types";

/**
 * Infer project architecture from dependency map
 *
 * Classifies files and determines architecture type based on:
 * - Import/export patterns
 * - File relationships
 * - Project structure
 */
export function inferArchitecture(
  files: ParsedFile[],
  dependencies: Record<string, string[]>
): ProjectArchitecture {
  const fileCount = files.length;

  // Single file project
  if (fileCount === 1) {
    return {
      type: "Single Script",
      entryPoints: [files[0].path],
      modules: [],
      description: "Single-file script with all code contained in one file.",
    };
  }

  // Build reverse dependency map (who imports each file)
  const importedBy: Record<string, string[]> = {};
  for (const file of files) {
    importedBy[file.path] = [];
  }

  for (const [importer, imported] of Object.entries(dependencies)) {
    for (const dep of imported) {
      if (importedBy[dep]) {
        importedBy[dep].push(importer);
      }
    }
  }

  // Classify files
  const entryPoints: string[] = [];
  const modules: string[] = [];
  const isolated: string[] = [];

  for (const file of files) {
    const imports = dependencies[file.path] || [];
    const isImportedBy = importedBy[file.path] || [];

    // Entry point: imports many files but is not imported by others
    if (imports.length > 0 && isImportedBy.length === 0) {
      entryPoints.push(file.path);
    }
    // Module/Utility: imported by others
    else if (isImportedBy.length > 0) {
      modules.push(file.path);
    }
    // Isolated: no imports and not imported
    else if (imports.length === 0 && isImportedBy.length === 0) {
      isolated.push(file.path);
    }
    // Mixed: has imports and is imported (intermediate module)
    else {
      modules.push(file.path);
    }
  }

  // Determine architecture type
  let type: ProjectArchitecture["type"];
  let description: string;

  if (isolated.length === fileCount) {
    // All files are isolated
    type = "Loose Scripts";
    description = `Collection of ${fileCount} independent scripts with no inter-file dependencies.`;
  } else if (entryPoints.length > 0 && modules.length > 0) {
    // Clear modular structure
    type = "Modular";
    description = `Modular architecture with ${entryPoints.length} entry point${
      entryPoints.length > 1 ? "s" : ""
    } and ${modules.length} supporting module${modules.length > 1 ? "s" : ""}.`;
  } else if (fileCount > 5 && entryPoints.length === 0) {
    // Complex structure without clear entry points
    type = "Complex";
    description = `Complex multi-file architecture with ${fileCount} interconnected files.`;
  } else {
    // Default to modular for smaller projects
    type = "Modular";
    description = `Simple modular structure with ${fileCount} files organized into ${modules.length} module${
      modules.length > 1 ? "s" : ""
    }.`;
  }

  console.log(`Architecture inferred: ${type}`);
  console.log(`Entry points: ${entryPoints.length}, Modules: ${modules.length}, Isolated: ${isolated.length}`);

  return {
    type,
    entryPoints,
    modules,
    description,
  };
}

/**
 * Get language statistics from files
 */
export function getLanguageStats(files: ParsedFile[]): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const file of files) {
    const lang = file.language || "unknown";
    stats[lang] = (stats[lang] || 0) + 1;
  }

  return stats;
}

/**
 * Find the largest file in the project
 */
export function getLargestFile(files: ParsedFile[]): ParsedFile | null {
  if (files.length === 0) return null;

  return files.reduce((largest, file) =>
    file.sizeBytes > largest.sizeBytes ? file : largest
  );
}

/**
 * Count total dependencies across all files
 */
export function getTotalDependencyCount(
  dependencies: Record<string, string[]>
): number {
  return Object.values(dependencies).flat().length;
}
