"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AppLayout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { fetchProjects } from "@/lib/projectClient";
import { authFetch } from "@/lib/authFetch";
import type { UploadResult, Project } from "@/types";

type SourceTab = "github" | "text" | "zip";
type UploadMode = "create" | "append";

interface TextFile {
  id: string;
  fileName: string;
  code: string;
}

export default function UploadPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [uploadMode, setUploadMode] = useState<UploadMode>("create");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [textFiles, setTextFiles] = useState<TextFile[]>([
    { id: crypto.randomUUID(), fileName: "", code: "" }
  ]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Load user's projects for append mode
  useEffect(() => {
    async function loadUserProjects() {
      if (!user) return;

      setLoadingProjects(true);
      try {
        const projects = await fetchProjects();
        setUserProjects(projects);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoadingProjects(false);
      }
    }

    loadUserProjects();
  }, [user]);

  // Helper functions for managing text files
  function addTextFile() {
    setTextFiles([...textFiles, { id: crypto.randomUUID(), fileName: "", code: "" }]);
  }

  function removeTextFile(id: string) {
    if (textFiles.length === 1) return; // Keep at least one
    setTextFiles(textFiles.filter(f => f.id !== id));
  }

  function updateTextFile(id: string, field: "fileName" | "code", value: string) {
    setTextFiles(textFiles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function validateTextFiles(): string | null {
    // Check for empty fields
    for (const file of textFiles) {
      if (!file.fileName.trim()) {
        return "All file names are required";
      }
      if (!file.code.trim()) {
        return "All files must have code content";
      }
    }

    // Check for duplicate file names
    const fileNames = textFiles.map(f => f.fileName.trim());
    const duplicates = fileNames.filter((name, index) => fileNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      return `Duplicate file name: ${duplicates[0]}`;
    }

    return null;
  }

  async function handleCreate() {
    if (!user) {
      setError("You must be logged in to create a project");
      return;
    }

    // Validation for append mode
    if (uploadMode === "append") {
      if (!selectedProjectId) {
        setError("Please select a project to add files to");
        return;
      }
    } else {
      // Validation for create mode
      const trimmedName = projectName.trim();
      if (!trimmedName) {
        setError("Project name is required");
        return;
      }
    }

    // Validate source input
    if (sourceTab === "github") {
      const trimmedUrl = githubUrl.trim();
      if (!trimmedUrl) {
        setError("GitHub URL is required");
        return;
      }
      if (!trimmedUrl.includes("github.com")) {
        setError("Invalid GitHub URL");
        return;
      }
    } else if (sourceTab === "text") {
      const validationError = validateTextFiles();
      if (validationError) {
        setError(validationError);
        return;
      }
    } else if (sourceTab === "zip") {
      if (!zipFile) {
        setError("ZIP file is required");
        return;
      }
      if (!zipFile.name.endsWith(".zip")) {
        setError("File must be a .zip file");
        return;
      }
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      // Call /api/upload to process the code with automatic authentication
      let res: Response;

      if (sourceTab === "github") {
        // GitHub URL → Send JSON (authFetch handles token automatically)
        res = await authFetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            github_url: githubUrl.trim(),
            mode: uploadMode,
            projectId: uploadMode === "append" ? selectedProjectId : undefined,
          }),
        });
      } else if (sourceTab === "text") {
        // TEXT → Send JSON with multiple files (authFetch handles token automatically)
        res = await authFetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            textFiles: textFiles.map(f => ({
              fileName: f.fileName.trim(),
              code: f.code.trim(),
            })),
            name: uploadMode === "create" ? projectName.trim() : "text-upload",
            mode: uploadMode,
            projectId: uploadMode === "append" ? selectedProjectId : undefined,
          }),
        });
      } else if (sourceTab === "zip" && zipFile) {
        // ZIP → Send FormData (authFetch handles token automatically)
        const formData = new FormData();
        formData.append("file", zipFile);
        formData.append("mode", uploadMode);
        if (uploadMode === "append") {
          formData.append("projectId", selectedProjectId);
        }
        res = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });
      } else {
        throw new Error("Invalid upload configuration");
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errorData.error || `Upload failed: ${res.statusText}`);
      }

      const result = await res.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Upload failed");
      }

      const uploadResult: UploadResult = result.data;

      // Handle based on mode
      if (uploadMode === "append") {
        // Show success message and stay on page
        setSuccessMessage("Files added to project successfully!");
        setGithubUrl("");
        setTextFiles([{ id: crypto.randomUUID(), fileName: "", code: "" }]);
        setZipFile(null);
        setLoading(false);

        console.log(`✅ [UI] Files appended to project: ${selectedProjectId}`);

        // Reload projects list from Firestore
        const projects = await fetchProjects();
        setUserProjects(projects);
        console.log(`♻️  [UI] Projects refetched after append: ${projects.length} total`);
      } else {
        // Create mode: Project was already created server-side
        console.log(`✅ [UI] Project created, redirecting to repositories`);
        // Just redirect to repositories page (which will load fresh from Firestore)
        router.push("/repositories");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload");
      setLoading(false);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.name.endsWith(".zip")) {
        setZipFile(file);
        setError("");
      } else {
        setError("Please upload a .zip file");
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.name.endsWith(".zip")) {
        setZipFile(file);
        setError("");
      } else {
        setError("Please upload a .zip file");
      }
    }
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <p className="text-muted">Please log in to create a project</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-3xl font-bold text-foreground">
            {uploadMode === "create" ? "Create New Code Project" : "Add Files to Project"}
          </h1>
          <p className="mt-2 text-muted">
            {uploadMode === "create"
              ? "Upload a repository or paste code to start analyzing"
              : "Add more files to an existing project"}
          </p>
        </motion.div>

        {/* Mode Toggle */}
        <motion.div
          className="rounded-xl border border-border bg-surface p-4"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => {
                setUploadMode("create");
                setSelectedProjectId("");
                setError("");
                setSuccessMessage("");
              }}
              disabled={loading}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                uploadMode === "create"
                  ? "border-neon/50 bg-neon/10 text-neon"
                  : "border-border bg-background text-muted hover:border-neon/30 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Create New Project
              </div>
            </button>
            <button
              onClick={() => {
                setUploadMode("append");
                setError("");
                setSuccessMessage("");
              }}
              disabled={loading}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                uploadMode === "append"
                  ? "border-neon/50 bg-neon/10 text-neon"
                  : "border-border bg-background text-muted hover:border-neon/30 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
                Add to Existing Project
              </div>
            </button>
          </div>
        </motion.div>

        {/* Form */}
        <motion.div
          className="rounded-xl border border-border bg-surface p-6 shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="space-y-6">
            {/* Project Selector (Append Mode Only) */}
            {uploadMode === "append" && (
              <div>
                <label htmlFor="project-select" className="block text-sm font-medium text-foreground">
                  Select Project
                </label>
                {loadingProjects ? (
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-muted">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
                    Loading projects...
                  </div>
                ) : userProjects.length === 0 ? (
                  <div className="mt-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-muted">
                    No projects found. Create one first!
                  </div>
                ) : (
                  <select
                    id="project-select"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={loading}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground transition-all focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">-- Select a project --</option>
                    {userProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} ({project.fileCount} files)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Project Name (Create Mode Only) */}
            {uploadMode === "create" && (
              <div>
                <label htmlFor="project-name" className="block text-sm font-medium text-foreground">
                  Project Name
                </label>
                <input
                  id="project-name"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  disabled={loading}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted/50 transition-all focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}

            {/* Source Type Tabs */}
            <div>
              <label className="block text-sm font-medium text-foreground">Source Type</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSourceTab("github")}
                  disabled={loading}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    sourceTab === "github"
                      ? "border-neon/50 bg-neon/10 text-neon"
                      : "border-border bg-background text-muted hover:border-neon/30 hover:text-foreground"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </button>
                <button
                  onClick={() => setSourceTab("zip")}
                  disabled={loading}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    sourceTab === "zip"
                      ? "border-neon/50 bg-neon/10 text-neon"
                      : "border-border bg-background text-muted hover:border-neon/30 hover:text-foreground"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  ZIP File
                </button>
                <button
                  onClick={() => setSourceTab("text")}
                  disabled={loading}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    sourceTab === "text"
                      ? "border-neon/50 bg-neon/10 text-neon"
                      : "border-border bg-background text-muted hover:border-neon/30 hover:text-foreground"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Paste Code
                </button>
              </div>
            </div>

            {/* Conditional Input */}
            {sourceTab === "github" && (
              <div>
                <label htmlFor="github-url" className="block text-sm font-medium text-foreground">
                  GitHub Repository URL
                </label>
                <input
                  id="github-url"
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  disabled={loading}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted/50 transition-all focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}

            {sourceTab === "zip" && (
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Upload ZIP File
                </label>
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`mt-1.5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-all ${
                    dragActive
                      ? "border-neon bg-neon/5"
                      : "border-border bg-background hover:border-neon/50 hover:bg-neon/5"
                  }`}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mb-4 text-muted"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>

                  {zipFile ? (
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">{zipFile.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <button
                        onClick={() => setZipFile(null)}
                        className="mt-3 text-xs text-neon hover:underline"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        Drag & drop your .zip file here
                      </p>
                      <p className="mt-1 text-xs text-muted">or click to browse</p>
                      <input
                        id="zip-file-input"
                        type="file"
                        accept=".zip"
                        onChange={handleFileSelect}
                        disabled={loading}
                        className="hidden"
                      />
                      <label
                        htmlFor="zip-file-input"
                        className="mt-4 inline-block cursor-pointer rounded-lg border border-neon/50 bg-neon/10 px-4 py-2 text-xs font-semibold text-neon transition-all hover:bg-neon/20"
                      >
                        Browse Files
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {sourceTab === "text" && (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-foreground">
                  Add Files to Project
                </label>

                {textFiles.map((file, index) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-border bg-background p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                        File {index + 1}
                      </span>
                      {textFiles.length > 1 && (
                        <button
                          onClick={() => removeTextFile(file.id)}
                          disabled={loading}
                          className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div>
                      <label htmlFor={`file-name-${file.id}`} className="block text-xs font-medium text-foreground mb-1.5">
                        File Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id={`file-name-${file.id}`}
                        type="text"
                        value={file.fileName}
                        onChange={(e) => updateTextFile(file.id, "fileName", e.target.value)}
                        placeholder="e.g., main.py, utils.js, index.html"
                        disabled={loading}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted/50 transition-all focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label htmlFor={`file-code-${file.id}`} className="block text-xs font-medium text-foreground mb-1.5">
                        Code Content <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id={`file-code-${file.id}`}
                        value={file.code}
                        onChange={(e) => updateTextFile(file.id, "code", e.target.value)}
                        placeholder="Paste your code here..."
                        rows={8}
                        disabled={loading}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground placeholder-muted/50 transition-all focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </motion.div>
                ))}

                <motion.button
                  onClick={addTextFile}
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neon/30 bg-neon/5 px-4 py-3 text-sm font-medium text-neon transition-all hover:border-neon/50 hover:bg-neon/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Add Another File
                </motion.button>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-neon/30 bg-neon/10 px-4 py-3 text-sm text-neon"
              >
                {successMessage}
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
              >
                {error}
              </motion.div>
            )}

            {/* Create/Upload Button */}
            <motion.button
              onClick={handleCreate}
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-neon px-6 py-3 font-semibold text-black transition-all hover:bg-neon/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  Processing...
                </>
              ) : uploadMode === "create" ? (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  Create Project
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Add Files to Project
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* How it Works */}
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h2 className="text-xl font-semibold text-foreground">How It Works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                num: 1,
                title: "Upload Code",
                desc: "Provide a GitHub URL or paste your code directly",
              },
              {
                num: 2,
                title: "AI Analysis",
                desc: "Gemini AI processes and understands your codebase",
              },
              {
                num: 3,
                title: "Chat & Explore",
                desc: "Ask questions and get instant explanations",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="rounded-lg border border-border bg-surface p-4 transition-all hover:border-neon/30"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-neon/20 text-sm font-bold text-neon">
                  {step.num}
                </div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
