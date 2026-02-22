import type { ParsedFile } from "@/types";

/**
 * Extract dependencies from JavaScript/TypeScript code
 */
function extractJSDependencies(content: string): string[] {
  const dependencies: Set<string> = new Set();

  // Match: import ... from "path" or import ... from 'path'
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"](\.{0,2}\/[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }

  // Match: require("path") or require('path')
  const requireRegex = /require\s*\(\s*['"](\.{0,2}\/[^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }

  // Match: export ... from "path"
  const exportFromRegex = /export\s+(?:[\w\s{},*]+\s+)?from\s+['"](\.{0,2}\/[^'"]+)['"]/g;
  while ((match = exportFromRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }

  return Array.from(dependencies);
}

/**
 * Extract dependencies from Python code
 */
function extractPythonDependencies(content: string): string[] {
  const dependencies: Set<string> = new Set();

  // Match: import module
  const importRegex = /^import\s+([\w.]+)/gm;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const module = match[1];
    // Only include relative imports (starting with .)
    if (module.startsWith(".")) {
      dependencies.add(module);
    }
  }

  // Match: from module import ...
  const fromImportRegex = /^from\s+([\w.]+)\s+import/gm;
  while ((match = fromImportRegex.exec(content)) !== null) {
    const module = match[1];
    if (module.startsWith(".")) {
      dependencies.add(module);
    }
  }

  return Array.from(dependencies);
}

/**
 * Detect dependencies for a single file based on its language
 */
function detectFileDependencies(file: ParsedFile): string[] {
  const language = file.language.toLowerCase();

  // JavaScript/TypeScript
  if (
    language === "javascript" ||
    language === "typescript" ||
    language === "jsx" ||
    language === "tsx"
  ) {
    return extractJSDependencies(file.content);
  }

  // Python
  if (language === "python") {
    return extractPythonDependencies(file.content);
  }

  // Other languages: no dependency detection yet
  return [];
}

/**
 * Build a dependency map for all files in a project
 *
 * Returns a map where:
 * - Key: file path
 * - Value: array of imported file paths
 *
 * Example:
 * {
 *   "index.js": ["./utils.js", "./math.js"],
 *   "utils.js": [],
 *   "math.js": []
 * }
 */
export function detectProjectDependencies(
  files: ParsedFile[]
): Record<string, string[]> {
  const dependencyMap: Record<string, string[]> = {};

  for (const file of files) {
    const dependencies = detectFileDependencies(file);
    dependencyMap[file.path] = dependencies;
  }

  console.log(`Dependency detection: ${files.length} files analyzed`);
  const totalDeps = Object.values(dependencyMap).flat().length;
  console.log(`Total dependencies found: ${totalDeps}`);

  return dependencyMap;
}

/**
 * Resolve relative imports to absolute file paths within the project
 *
 * Converts "./utils" to "src/utils.js" based on the importing file's location
 */
export function resolveDependencies(
  dependencyMap: Record<string, string[]>,
  files: ParsedFile[]
): Record<string, string[]> {
  const resolvedMap: Record<string, string[]> = {};
  const fileSet = new Set(files.map((f) => f.path));

  for (const [filePath, deps] of Object.entries(dependencyMap)) {
    const resolved: string[] = [];

    for (const dep of deps) {
      // Try to resolve the dependency
      const fileDir = filePath.split("/").slice(0, -1).join("/");
      let resolvedPath = dep;

      // Handle relative imports
      if (dep.startsWith("./")) {
        resolvedPath = fileDir ? `${fileDir}/${dep.slice(2)}` : dep.slice(2);
      } else if (dep.startsWith("../")) {
        const parts = fileDir.split("/");
        const upCount = (dep.match(/\.\.\//g) || []).length;
        const remaining = dep.replace(/\.\.\//g, "");
        const newDir = parts.slice(0, -upCount).join("/");
        resolvedPath = newDir ? `${newDir}/${remaining}` : remaining;
      }

      // Try common extensions if path doesn't exist
      if (!fileSet.has(resolvedPath)) {
        const extensions = [".js", ".ts", ".jsx", ".tsx", ".py", ".mjs"];
        for (const ext of extensions) {
          const withExt = `${resolvedPath}${ext}`;
          if (fileSet.has(withExt)) {
            resolvedPath = withExt;
            break;
          }
        }
      }

      // Try index files
      if (!fileSet.has(resolvedPath)) {
        const indexPaths = [
          `${resolvedPath}/index.js`,
          `${resolvedPath}/index.ts`,
          `${resolvedPath}/index.tsx`,
        ];
        for (const indexPath of indexPaths) {
          if (fileSet.has(indexPath)) {
            resolvedPath = indexPath;
            break;
          }
        }
      }

      resolved.push(resolvedPath);
    }

    resolvedMap[filePath] = resolved;
  }

  return resolvedMap;
}
