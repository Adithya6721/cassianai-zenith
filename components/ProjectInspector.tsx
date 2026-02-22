"use client";

import { useState } from "react";
import type { Project } from "@/types";
import {
  getLanguageStats,
  getLargestFile,
  getTotalDependencyCount,
} from "@/services/architectureInference";
import dynamic from "next/dynamic";

const GraphViewer = dynamic(() => import("./GraphViewer"), { ssr: false });

interface ProjectInspectorProps {
  project: Project;
}

export default function ProjectInspector({ project }: ProjectInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  // Only show in development
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const languageStats = getLanguageStats(project.files);
  const largestFile = getLargestFile(project.files);
  const totalDeps = project.dependencies
    ? getTotalDependencyCount(project.dependencies)
    : 0;

  // Group chunks by file path
  const chunksByFile = new Map<string, typeof project.chunks>();
  if (project.chunks) {
    for (const chunk of project.chunks) {
      const existing = chunksByFile.get(chunk.filePath) || [];
      existing.push(chunk);
      chunksByFile.set(chunk.filePath, existing);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface">
      {/* Toggle button */}
      <div className="flex w-full items-center justify-between px-4 py-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
        >
          <span>🔍 Project Inspector (Dev Mode)</span>
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
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Small View Graph button always visible in the toolbar */}
        <button
          onClick={() => setShowGraph(true)}
          className="rounded border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-neon/50 hover:text-neon"
        >
          View Graph
        </button>
      </div>

      {/* Inspector content */}
      {isOpen && (
        <div className="border-t border-border bg-background p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Basic Info */}
            <div className="rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Basic Info
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">ID:</span>
                  <span className="font-mono text-foreground">
                    {project.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Type:</span>
                  <span className="capitalize text-foreground">{project.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Files:</span>
                  <span className="text-neon">{project.fileCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Chunks:</span>
                  <span className="text-neon">{project.chunkCount}</span>
                </div>
              </div>
            </div>

            {/* Languages */}
            <div className="rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Languages
              </h4>
              <div className="space-y-1 text-sm">
                {Object.entries(languageStats)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([lang, count]) => (
                    <div key={lang} className="flex justify-between">
                      <span className="capitalize text-muted">{lang}:</span>
                      <span className="text-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Dependencies */}
            <div className="rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Dependencies
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Total:</span>
                  <span className="text-neon">{totalDeps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Files with deps:</span>
                  <span className="text-foreground">
                    {project.dependencies
                      ? Object.values(project.dependencies).filter((d) => d.length > 0)
                          .length
                      : 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Architecture */}
            <div className="rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Architecture
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Type:</span>
                  <span className="text-neon">
                    {project.architectureData?.type || "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Entry points:</span>
                  <span className="text-foreground">
                    {project.architectureData?.entryPoints.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Modules:</span>
                  <span className="text-foreground">
                    {project.architectureData?.modules.length || 0}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Largest File */}
          {largestFile && (
            <div className="mt-4 rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Largest File
              </h4>
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-foreground">{largestFile.path}</span>
                <span className="text-muted">
                  {(largestFile.sizeBytes / 1024).toFixed(2)} KB
                </span>
              </div>
            </div>
          )}

          {/* Architecture Description */}
          {project.architectureData?.description && (
            <div className="mt-4 rounded-lg border border-border bg-surface p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Architecture Analysis
              </h4>
              <p className="text-sm text-foreground">
                {project.architectureData.description}
              </p>
            </div>
          )}

          {/* Files Section - Show each file separately */}
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Files ({project.files.length})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {project.files.map((file, index) => {
                const fileChunks = chunksByFile.get(file.path) || [];
                const fileDeps = project.dependencies?.[file.path] || [];
                const isExpanded = expandedFile === file.path;

                return (
                  <div
                    key={file.id || file.path}
                    className="rounded border border-border bg-background"
                  >
                    {/* File Header */}
                    <button
                      onClick={() => setExpandedFile(isExpanded ? null : file.path)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-surface"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neon">
                          File {index + 1}:
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {file.path}
                        </span>
                      </div>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-muted transition-transform"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* File Details (Expanded) */}
                    {isExpanded && (
                      <div className="border-t border-border p-3 space-y-3">
                        {/* Metadata */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted">Language:</span>
                            <span className="capitalize text-foreground">{file.language}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Size:</span>
                            <span className="text-foreground">
                              {(file.sizeBytes / 1024).toFixed(2)} KB
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Extension:</span>
                            <span className="text-foreground">.{file.extension}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Chunks:</span>
                            <span className="text-neon">{fileChunks.length}</span>
                          </div>
                        </div>

                        {/* Dependencies */}
                        {fileDeps.length > 0 && (
                          <div>
                            <h5 className="mb-1 text-xs font-semibold text-muted">
                              Dependencies ({fileDeps.length}):
                            </h5>
                            <div className="space-y-1">
                              {fileDeps.slice(0, 5).map((dep, i) => (
                                <div key={i} className="font-mono text-xs text-foreground">
                                  → {dep}
                                </div>
                              ))}
                              {fileDeps.length > 5 && (
                                <div className="text-xs text-muted">
                                  ... and {fileDeps.length - 5} more
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Chunks */}
                        {fileChunks.length > 0 && (
                          <div>
                            <h5 className="mb-1 text-xs font-semibold text-muted">
                              Chunks ({fileChunks.length}):
                            </h5>
                            <div className="space-y-1">
                              {fileChunks.map((chunk, i) => (
                                <div
                                  key={i}
                                  className="rounded border border-border bg-surface p-2"
                                >
                                  <div className="mb-1 flex justify-between text-xs">
                                    <span className="text-muted">Chunk {chunk.chunkIndex}</span>
                                    <span className="text-muted">
                                      {chunk.content.length} chars
                                    </span>
                                  </div>
                                  <pre className="font-mono text-xs text-foreground overflow-x-auto">
                                    {chunk.content.slice(0, 200)}
                                    {chunk.content.length > 200 && "..."}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* File ID (from Firestore) */}
                        {file.id && (
                          <div className="pt-2 border-t border-border">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Firestore ID:</span>
                              <span className="font-mono text-foreground">
                                {file.id.slice(0, 12)}...
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Graph Viewer Modal - Centered Window */}
      {showGraph && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowGraph(false)}
        >
          <div
            className="relative w-[90vw] h-[85vh] max-w-7xl flex flex-col rounded-lg border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 rounded-t-lg">
              <h2 className="text-lg font-semibold text-foreground">
                Code Graph - {project.name}
              </h2>
              <button
                onClick={() => setShowGraph(false)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
              >
                Close
              </button>
            </div>

            {/* Graph Viewer */}
            <div className="flex-1 overflow-hidden rounded-b-lg">
              {project.graph ? (
                <GraphViewer graph={project.graph} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg text-muted mb-2">No graph data available</p>
                    <p className="text-sm text-muted">
                      The code graph may still be building, or no analyzable code was found.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
