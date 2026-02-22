"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import TypingText from "@/components/TypingText";
import { authFetch } from "@/lib/authFetch";

// ── Types ────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// ── Constants ────────────────────────────────────────────────

const TRIGGER_WIDTH = 18;
const PANEL_WIDTH = 380;

// ── Component ────────────────────────────────────────────────

export default function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! I'm CASSIAN — I'm here to help you navigate, explore, and understand. Ask me anything.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [latestAssistantId, setLatestAssistantId] = useState<string>("welcome");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevMsgCountRef = useRef(1); // starts at 1 (welcome message)

  // Auto-scroll: only fires on NEW messages, uses requestAnimationFrame
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

  // During typing: only scroll if user is already near the bottom (within 150px)
  useEffect(() => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);

    if (latestAssistantId && latestAssistantId !== "welcome") {
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

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // ── Mouse edge detection ─────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const nearRightEdge = e.clientX >= window.innerWidth - TRIGGER_WIDTH;
      if (nearRightEdge && !open) setOpen(true);
    },
    [open]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  const handlePanelMouseLeave = useCallback((e: React.MouseEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect && e.clientX < rect.left) setOpen(false);
  }, []);

  // ── Clear chat ───────────────────────────────────────────

  function handleClear() {
    const welcome: Message = {
      id: "welcome",
      role: "assistant",
      text: "Hi! I'm CASSIAN — I'm here to help you navigate, explore, and understand. Ask me anything.",
    };
    setMessages([welcome]);
    setInput("");
    prevMsgCountRef.current = 1;
    setLatestAssistantId("welcome");
  }

  // ── Stop generation ──────────────────────────────────────

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  // ── Send message ─────────────────────────────────────────

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await authFetch("/api/assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: controller.signal,
      });

      const json = await res.json();
      const answer =
        json.success && json.data?.answer
          ? json.data.answer
          : "Sorry, I couldn't get a response. Try again in a moment.";

      const assistantId = `asst-${Date.now()}`;
      setLatestAssistantId(assistantId);
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: answer }]);
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      const errId = `err-${Date.now()}`;
      setLatestAssistantId(errId);
      setMessages((prev) => [
        ...prev,
        {
          id: errId,
          role: "assistant",
          text: isAbort ? "Generation stopped." : "Something went wrong reaching the server. Please try again.",
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
      if (loading) handleStop();
      else handleSend();
    }
    if (e.key === "Escape" && loading) handleStop();
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      {/* Invisible hover trigger strip */}
      <div
        className="fixed right-0 top-0 z-60 h-full"
        style={{ width: TRIGGER_WIDTH }}
        onMouseEnter={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ x: PANEL_WIDTH }}
            animate={{ x: 0 }}
            exit={{ x: PANEL_WIDTH }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onMouseLeave={handlePanelMouseLeave}
            className="fixed right-0 top-0 z-55 flex h-full flex-col border-l border-border bg-surface/95 backdrop-blur-md"
            style={{ width: PANEL_WIDTH }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-neon animate-pulse" />
                <span className="text-sm font-semibold tracking-wide text-foreground">
                  CASSIAN Assistant
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleClear}
                  title="Clear chat"
                  className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg) => {
                const isLatestAssistant = msg.role === "assistant" && msg.id === latestAssistantId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-neon/15 text-foreground"
                          : "bg-surface-hover text-foreground"
                      }`}
                    >
                      {isLatestAssistant && msg.id !== "welcome" ? (
                        <MessageContentTyping text={msg.text} />
                      ) : (
                        <MessageContent text={msg.text} />
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-lg bg-surface-hover px-3 py-2">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/60" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={loading ? "Generating… (Esc to stop)" : "Ask me anything..."}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-neon/50 disabled:opacity-50"
                />

                {/* Send / Stop button */}
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.button
                      key="stop"
                      onClick={handleStop}
                      title="Stop generation"
                      className="flex shrink-0 items-center justify-center rounded-lg bg-red-500/15 p-2 text-red-400 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/25"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.15 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {/* Square stop icon */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="2" y="2" width="10" height="10" rx="1.5" />
                      </svg>
                    </motion.button>
                  ) : (
                    <motion.button
                      key="send"
                      onClick={handleSend}
                      disabled={!input.trim()}
                      title="Send"
                      className="flex shrink-0 items-center justify-center rounded-lg bg-neon/15 p-2 text-neon transition-colors hover:bg-neon/25 disabled:opacity-30 disabled:cursor-not-allowed"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.15 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                      </svg>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Markdown renderer ─────────────────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p:      ({ children }) => <p      className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul:     ({ children }) => <ul     className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
  ol:     ({ children }) => <ol     className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
  li:     ({ children }) => <li     className="leading-relaxed">{children}</li>,
  h3:     ({ children }) => <h3     className="font-bold text-sm mt-3 mb-1 text-foreground">{children}</h3>,
  h4:     ({ children }) => <h4     className="font-semibold text-xs mt-2 mb-1 text-muted">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-neon">{children}</strong>,
  em:     ({ children }) => <em     className="italic opacity-80">{children}</em>,
  code:   ({ children }) => <code   className="rounded bg-background px-1 py-0.5 font-mono text-[10px] text-neon">{children}</code>,
  hr:     ()             => <hr     className="border-border my-3" />,
};

function MessageContent({ text }: { text: string }) {
  return <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>;
}

function MessageContentTyping({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  if (done) return <MessageContent text={text} />;
  return <TypingText text={text} speed={60} className="inline-block whitespace-pre-wrap" onComplete={() => setDone(true)} />;
}
