"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import AppLayout from "@/components/Layout";
import GraphViewer from "@/components/GraphViewer";
import TypingText from "@/components/TypingText";
import { useAuth } from "@/context/AuthContext";
import { fetchProjects, fetchProjectById } from "@/lib/projectClient";
import { authFetch } from "@/lib/authFetch";
import type { Project } from "@/types";

// ── Markdown component map ────────────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p:      ({ children }) => <p      className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul:     ({ children }) => <ul     className="list-disc pl-5 space-y-1 my-2">{children}</ul>,
  ol:     ({ children }) => <ol     className="list-decimal pl-5 space-y-1 my-2">{children}</ol>,
  li:     ({ children }) => <li     className="leading-relaxed">{children}</li>,
  h3:     ({ children }) => <h3     className="font-bold text-base mt-4 mb-2 text-foreground">{children}</h3>,
  h4:     ({ children }) => <h4     className="font-semibold text-sm mt-3 mb-1 text-foreground">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-neon">{children}</strong>,
  em:     ({ children }) => <em     className="italic opacity-80">{children}</em>,
  code:   ({ children }) => <code   className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-neon">{children}</code>,
  hr:     ()             => <hr     className="border-border my-4" />,
};

// ── Types ────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  blastRadius?: {
    targetNodeId: string | null;
    affectedNodeIds: string[];
    affectedPaths: string[];
  };
}

interface MessagePart {
  type: "text" | "code";
  content: string;
  language?: string;
}

// ── Parse markdown code blocks ────────────────────────────────

function parseMessage(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", language: match[1] || "text", content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: text }];
}

function hasCodeBlocks(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

// ── Code Block component ──────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  // Try to extract file path from first comment line (// path/to/file or # path)
  const lines = code.split("\n");
  let filePath: string | null = null;
  let displayCode = code.trimEnd();

  const firstLine = lines[0]?.trim();
  if (firstLine) {
    const commentPathMatch = firstLine.match(/^(?:\/\/|#|--)\s*([\w./\\-]+\.\w{1,10})\s*$/);
    if (commentPathMatch) {
      filePath = commentPathMatch[1];
      displayCode = lines.slice(1).join("\n").trimStart();
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(displayCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          {/* macOS-style traffic lights */}
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
          </div>
          <span className="font-mono text-[10px] text-muted">
            {filePath ?? (language || "code")}
          </span>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-neon">Copied!</span>
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <pre className="overflow-x-auto bg-background px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground">
        <code>{displayCode}</code>
      </pre>
    </div>
  );
}

// ── Message text renderer ─────────────────────────────────────

function MessageContent({ text }: { text: string }) {
  return <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>;
}

// ── Full assistant message renderer (text + code blocks) ──────

function AssistantMessageBody({
  text,
  isTyping,
}: {
  text: string;
  isTyping: boolean;
}) {
  // If it's the latest message and has no code blocks, use typing animation
  if (isTyping && !hasCodeBlocks(text)) {
    return <TypingText text={text} speed={60} className="inline-block" />;
  }

  const parts = parseMessage(text);

  return (
    <div className="space-y-1">
      {parts.map((part, i) =>
        part.type === "code" ? (
          <CodeBlock key={i} language={part.language!} code={part.content} />
        ) : (
          <MessageContent key={i} text={part.content} />
        )
      )}
    </div>
  );
}

// ── Sparkle easter egg ────────────────────────────────────────

// Pre-compute stable positions at module level so Math.random() never runs during render
const SPARKLE_PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  initX: `${30 + (i * 7 + 3) % 40}%`,
  initY: `${30 + (i * 11 + 5) % 40}%`,
  animX: `${10 + (i * 13 + 7) % 80}%`,
  animY: `${10 + (i * 17 + 3) % 80}%`,
}));

function CaspianSparkle({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {SPARKLE_PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-neon"
            initial={{ x: p.initX, y: p.initY, opacity: 0, scale: 0 }}
            animate={{ x: p.animX, y: p.animY, opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
            transition={{ duration: 1.2, delay: i * 0.1, ease: "easeOut" as const }}
            style={{ boxShadow: "0 0 6px rgba(var(--accent-rgb), 0.6)" }}
          />
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Page component ───────────────────────────────────────────

function ChatPageContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sparkle, setSparkle] = useState(false);
  const [latestAssistantId, setLatestAssistantId] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [enteringProjectId, setEnteringProjectId] = useState<string | null>(null);
  const [impactModal, setImpactModal] = useState<{
    affectedNodeIds: string[];
    affectedPaths: string[];
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track previous message count so we only auto-scroll on NEW messages
  const prevMsgCountRef = useRef(0);

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      try {
        const userProjects = await fetchProjects();
        setProjects(userProjects);
      } catch (error) {
        console.error("Failed to load projects:", error);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, [user]);

  // Load project from URL parameter
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId) {
      setSelectedProject(null);
      return;
    }

    async function loadProject(id: string) {
      try {
        const project = await fetchProjectById(id);
        setSelectedProject(project ?? null);
      } catch {
        setSelectedProject(null);
      }
    }
    loadProject(projectId);
  }, [searchParams]);

  // Auto-scroll: fires only when a NEW message is added (not on every re-render).
  // Uses requestAnimationFrame so the DOM has painted before measuring height.
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  // During the typing animation: only scroll if the user is already near the
  // bottom (within 150 px), so manual scroll-up to re-read context is not broken.
  useEffect(() => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);

    if (latestAssistantId) {
      typingIntervalRef.current = setInterval(() => {
        const el = scrollRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom < 150) {
          el.scrollTop = el.scrollHeight;
        }
      }, 120);
    }

    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, [latestAssistantId]);

  // Caspian sparkle easter egg
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      if (val.toLowerCase().includes("caspian") && !sparkle) {
        setSparkle(true);
        setTimeout(() => setSparkle(false), 1500);
      }
    },
    [sparkle]
  );

  function handleClear() {
    setMessages([]);
    setInput("");
    setLatestAssistantId(null);
  }

  // ── Stop generation ─────────────────────────────────────────
  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  // ── Send message ────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setLatestAssistantId(null);

    // Create a fresh abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const endpoint = selectedProject ? "/api/chat" : "/api/assistant-chat";
      const body = selectedProject
        ? { repoId: selectedProject.id, question: text }
        : { question: text };

      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = await res.json();
      const answer =
        json.success && json.data?.answer
          ? json.data.answer
          : "Sorry, I couldn't get a response. Try again in a moment.";

      const assistantId = `asst-${Date.now()}`;
      setLatestAssistantId(assistantId);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          text: answer,
          blastRadius: json.data?.blastRadius,
        },
      ]);
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));

      const errId = `err-${Date.now()}`;
      setLatestAssistantId(null);
      setMessages((prev) => [
        ...prev,
        {
          id: errId,
          role: "assistant",
          text: isAbort
            ? "Generation stopped."
            : "Something went wrong reaching the server. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (loading) {
        handleStop();
      } else {
        handleSend();
      }
    }
    if (e.key === "Escape" && loading) {
      handleStop();
    }
  }

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.replace("/");
    }
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
      </div>
    );
  }

  if (!user) return null;

  // ── Project selector ────────────────────────────────────────
  if (!selectedProject) {
    return (
      <AppLayout>
        <div className="p-8">
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <h1 className="text-2xl font-semibold text-foreground">Chat with Code</h1>
            <p className="mt-1 text-sm text-muted">Select a project to chat about your code</p>
          </motion.div>

          {loadingProjects && (
            <motion.div
              className="flex items-center justify-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
            </motion.div>
          )}

          {!loadingProjects && projects.length === 0 && (
            <motion.div
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-8 py-20"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-muted">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="mt-1 text-xs text-muted">Create your first code project to start chatting</p>
              <motion.a
                href="/upload"
                className="mt-5 rounded-lg bg-neon px-5 py-2 text-sm font-semibold text-black transition-all hover:bg-neon/90"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Create Project
              </motion.a>
            </motion.div>
          )}

          {!loadingProjects && projects.length > 0 && (
            <motion.div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
            >
              {projects.map((project, index) => {
                const isEntering = enteringProjectId === project.id;
                return (
                  <motion.button
                    key={project.id}
                    onClick={() => {
                      setEnteringProjectId(project.id);
                      router.push(`/chat?project=${project.id}`);
                    }}
                    disabled={isEntering}
                    className="group relative overflow-hidden rounded-xl border border-border bg-surface p-6 text-left transition-all hover:border-neon/30 disabled:cursor-wait"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index, duration: 0.3 }}
                    whileHover={isEntering ? {} : { y: -2 }}
                  >
                    {/* Per-card loading overlay */}
                    {isEntering && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/80 backdrop-blur-sm">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
                      </div>
                    )}

                    <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted w-fit">
                      {project.source === "github" ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                          </svg>
                          GitHub
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                          </svg>
                          Text
                        </>
                      )}
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">{project.name}</h3>
                    <p className="text-xs text-muted">
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Chat UI ─────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="relative flex h-full flex-col p-8">
        <CaspianSparkle active={sparkle} />

        {/* Header */}
        <motion.div
          className="mb-6 flex items-center justify-between"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{selectedProject.name}</h1>
              <motion.button
                onClick={() => router.push("/chat")}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-neon/30 hover:text-foreground"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Change Project
              </motion.button>
            </div>
            <p className="mt-1 text-sm text-muted">Ask questions about your code</p>
          </div>

          {hasMessages && (
            <motion.button
              onClick={handleClear}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-neon/30 hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
              Clear
            </motion.button>
          )}
        </motion.div>

        {/* Chat area */}
        <motion.div
          className="flex flex-1 flex-col rounded-xl border border-border bg-surface overflow-hidden"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
        >
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {!hasMessages ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-hover">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neon/60">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground">Start a conversation</p>
                <p className="mt-1 max-w-xs text-xs text-muted">
                  Ask about your codebase, or try general questions. Type &quot;caspian&quot; for a surprise.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {[
                    "What does this project do?",
                    "How is the code structured?",
                    "What is CASSIAN?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-neon/30 hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isLatestAssistant =
                  msg.role === "assistant" && msg.id === latestAssistantId;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-neon/15 text-foreground"
                          : "bg-surface-hover text-foreground"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <MessageContent text={msg.text} />
                      ) : (
                        <AssistantMessageBody
                          text={msg.text}
                          isTyping={isLatestAssistant}
                        />
                      )}
                    </div>
                    {/* Blast radius: View Impact Graph button */}
                    {msg.blastRadius && msg.blastRadius.affectedNodeIds.length > 0 && selectedProject?.graph && (
                      <motion.button
                        onClick={() => setImpactModal({ affectedNodeIds: msg.blastRadius!.affectedNodeIds, affectedPaths: msg.blastRadius!.affectedPaths })}
                        className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        View Impact Graph — {msg.blastRadius.affectedNodeIds.length} affected node{msg.blastRadius.affectedNodeIds.length !== 1 ? "s" : ""}
                      </motion.button>
                    )}
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl bg-surface-hover px-4 py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Input row */}
        <motion.div
          className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: "easeOut" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={loading ? "Generating response… (Esc or Stop to cancel)" : "Ask a question about the codebase..."}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

          {/* Send / Stop button */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.button
                key="stop"
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-400 ring-1 ring-red-500/30 transition-all duration-150 hover:bg-red-500/25 hover:text-red-300"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.92 }}
              >
                {/* Square stop icon */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <rect x="1" y="1" width="8" height="8" rx="1.5" />
                </svg>
                Stop
              </motion.button>
            ) : (
              <motion.button
                key="send"
                onClick={handleSend}
                disabled={!input.trim()}
                className="rounded-lg bg-neon/20 px-4 py-2 text-xs font-semibold text-neon transition-all duration-200 hover:bg-neon/30 disabled:cursor-not-allowed disabled:opacity-30"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.92 }}
              >
                Send
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Impact Graph Modal ───────────────────────────────── */}
      <AnimatePresence>
        {impactModal && selectedProject?.graph && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setImpactModal(null)}
          >
            <motion.div
              className="relative flex h-[82vh] w-[92vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-red-500/30 bg-background shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-semibold text-foreground">Impact Graph</span>
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                    {impactModal.affectedNodeIds.length} affected node{impactModal.affectedNodeIds.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  onClick={() => setImpactModal(null)}
                  className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              {/* Affected file list + graph */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar: affected paths */}
                <div className="flex w-52 shrink-0 flex-col border-r border-border bg-surface/60 overflow-y-auto">
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Affected Files</p>
                  {impactModal.affectedPaths.map((p) => (
                    <div key={p} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-red-400/80 hover:text-red-400">
                      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/60" />
                      <span className="truncate" title={p}>{p}</span>
                    </div>
                  ))}
                </div>

                {/* Graph viewer */}
                <div className="flex-1">
                  <GraphViewer
                    graph={selectedProject.graph}
                    highlightedNodeIds={impactModal.affectedNodeIds}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
