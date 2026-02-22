"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import AppLayout from "@/components/Layout";
import ProjectFileTree from "@/components/ProjectFileTree";
import ProjectInspector from "@/components/ProjectInspector";
import { useAuth } from "@/context/AuthContext";
import { fetchProjectById } from "@/lib/projectClient";
import { authFetch } from "@/lib/authFetch";
import type { Project, ParsedFile } from "@/types";

export default function ProjectViewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ParsedFile | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace("/");
    }
  }, [user, loading]);

  useEffect(() => {
    async function loadProject() {
      if (!user || !projectId) return;

      try {
        const proj = await fetchProjectById(projectId);

        if (!proj) {
          setError("Project not found");
          return;
        }

        // Ownership is already verified by the API route
        setProject(proj);

        // Auto-select first file for multi-file projects
        if (proj.files && proj.files.length > 0) {
          setSelectedFile(proj.files[0]);
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        setError("Failed to load project");
      } finally {
        setLoadingProject(false);
      }
    }

    loadProject();
  }, [user, projectId]);

  async function handleCopy() {
    const content = selectedFile?.content || project?.rawCode || "";
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  async function handleDownloadZip() {
    if (!projectId) return;

    try {
      const res = await authFetch(`/api/download/${projectId}`);
      if (!res.ok) {
        throw new Error("Failed to download ZIP");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "project"}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download ZIP file");
    }
  }

  if (!user) return null;

  if (loadingProject) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
        </div>
      </AppLayout>
    );
  }

  if (error || !project) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-red-500">{error || "Project not found"}</p>
            <motion.button
              onClick={() => router.push("/repositories")}
              className="mt-4 rounded-lg border border-neon/50 bg-neon/10 px-6 py-2 text-sm font-semibold text-neon transition-all hover:bg-neon/20"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Back to Projects
            </motion.button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Multi-file project with file tree
  const hasMultipleFiles = project.files && project.files.length > 1;

  return (
    <AppLayout>
      <div className="flex h-screen flex-col">
        {/* Header */}
        <div className="border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => router.push("/repositories")}
                className="text-muted transition-colors hover:text-neon"
                whileHover={{ x: -4 }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </motion.button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted">
                    {project.type === "github" ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        GitHub
                      </>
                    ) : project.type === "zip" ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                        ZIP
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                        Text
                      </>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {project.fileCount} file{project.fileCount > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {project.type === "zip" && (
                <motion.button
                  onClick={handleDownloadZip}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-all hover:border-neon/30 hover:bg-surface"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Download ZIP
                </motion.button>
              )}
              <motion.button
                onClick={() => router.push(`/chat?project=${project.id}`)}
                className="rounded-lg bg-neon px-6 py-2 text-sm font-semibold text-black transition-all hover:bg-neon/90"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Chat with Code
              </motion.button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* File tree (only for multi-file projects) */}
          {hasMultipleFiles && (
            <div className="w-64 flex-shrink-0">
              <ProjectFileTree
                files={project.files}
                selectedFile={selectedFile?.path || null}
                onFileSelect={setSelectedFile}
              />
            </div>
          )}

          {/* File viewer */}
          <div className="flex-1 overflow-auto bg-background p-6">
            {selectedFile ? (
              <div className="mx-auto max-w-5xl">
                {/* File header */}
                <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-surface p-4">
                  <div>
                    <p className="font-mono text-sm text-neon">{selectedFile.path}</p>
                    <p className="mt-1 text-xs text-muted">
                      {selectedFile.language} • {(selectedFile.sizeBytes / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <motion.button
                    onClick={handleCopy}
                    className="flex items-center gap-2 rounded-lg border border-neon/50 bg-neon/10 px-4 py-2 text-sm font-semibold text-neon transition-all hover:bg-neon/20"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {copied ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                        Copy
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Code content */}
                <div className="max-h-[600px] overflow-auto rounded-lg border border-border bg-background">
                  <pre className="p-4 font-mono text-sm text-foreground">
                    <code>{selectedFile.content}</code>
                  </pre>
                </div>
              </div>
            ) : (
              // Legacy single-file view
              <div className="mx-auto max-w-5xl">
                {project.type === "text" && project.rawCode && (
                  <div className="rounded-xl border border-border bg-surface p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-foreground">Code Content</h2>
                      <motion.button
                        onClick={handleCopy}
                        className="flex items-center gap-2 rounded-lg border border-neon/50 bg-neon/10 px-4 py-2 text-sm font-semibold text-neon transition-all hover:bg-neon/20"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {copied ? (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                            </svg>
                            Copy
                          </>
                        )}
                      </motion.button>
                    </div>
                    <div className="max-h-[600px] overflow-auto rounded-lg border border-border bg-background">
                      <pre className="p-4 font-mono text-sm text-foreground">
                        <code>{project.rawCode}</code>
                      </pre>
                    </div>
                  </div>
                )}

                {project.type === "github" && (
                  <div className="rounded-xl border border-border bg-surface p-8">
                    <div className="mb-6 text-center">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-4 text-neon">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      <h2 className="mb-2 text-xl font-semibold text-foreground">GitHub Repository</h2>
                      {project.githubUrl && (
                        <motion.a
                          href={project.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neon/50 bg-neon/10 px-6 py-3 text-sm font-semibold text-neon transition-all hover:bg-neon/20"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" x2="21" y1="14" y2="3" />
                          </svg>
                          Open in GitHub
                        </motion.a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inspector (dev mode only) */}
        <ProjectInspector project={project} />
      </div>
    </AppLayout>
  );
}
