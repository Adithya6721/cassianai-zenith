"use client";

import { useState, useMemo } from "react";
import type { ParsedFile } from "@/types";

interface TreeNode {
  name: string;
  path: string;
  fullPath: string; // Unique path from root (parent/child hierarchy)
  type: "file" | "folder";
  children?: TreeNode[];
  file?: ParsedFile;
  fileId?: string; // Firestore document ID (for files only)
}

interface ProjectFileTreeProps {
  files: ParsedFile[];
  selectedFile: string | null;
  onFileSelect: (file: ParsedFile) => void;
}

/**
 * Build a tree structure from flat file paths
 */
function buildFileTree(files: ParsedFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", fullPath: "", type: "folder", children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    // Create folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const fullPath = current.fullPath ? `${current.fullPath}/${part}` : part;

      let existing = current.children?.find(
        (n) => n.name === part && n.type === "folder"
      );

      if (!existing) {
        existing = {
          name: part,
          path,
          fullPath,
          type: "folder",
          children: [],
        };
        current.children = current.children || [];
        current.children.push(existing);
      }

      current = existing;
    }

    // Add file node
    const fileName = parts[parts.length - 1];
    const fullPath = current.fullPath ? `${current.fullPath}/${fileName}` : fileName;
    current.children = current.children || [];
    current.children.push({
      name: fileName,
      path: file.path,
      fullPath,
      type: "file",
      file,
      fileId: file.id, // Firestore document ID
    });
  }

  // Sort: folders first, then alphabetically
  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  function sortTree(node: TreeNode) {
    if (node.children) {
      node.children = sortNodes(node.children);
      node.children.forEach(sortTree);
    }
  }

  sortTree(root);

  return root.children || [];
}

function TreeItem({
  node,
  selectedFile,
  onFileSelect,
  depth = 0,
}: {
  node: TreeNode;
  selectedFile: string | null;
  onFileSelect: (file: ParsedFile) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const isSelected = node.type === "file" && node.path === selectedFile;

  if (node.type === "file") {
    return (
      <div
        onClick={() => node.file && onFileSelect(node.file)}
        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
          isSelected
            ? "bg-neon/20 text-neon"
            : "text-foreground hover:bg-surface"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="font-medium">{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div>
          {node.children.map((child, index) => (
            <TreeItem
              key={child.fileId ?? child.fullPath ?? `${child.path}-${index}`}
              node={child}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectFileTree({
  files,
  selectedFile,
  onFileSelect,
}: ProjectFileTreeProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);

  return (
    <div className="h-full overflow-y-auto border-r border-border bg-background">
      <div className="border-b border-border p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Files ({files.length})
        </h3>
      </div>
      <div className="p-2">
        {tree.map((node, index) => (
          <TreeItem
            key={node.fileId ?? node.fullPath ?? `${node.path}-${index}`}
            node={node}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
}
