"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/Layout";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { fetchProjects } from "@/lib/projectClient";
import type { Project } from "@/types";

// ── Constellation easter egg ─────────────────────────────────

function ConstellationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let w = 0;
    let h = 0;

    interface Star {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
    }

    const stars: Star[] = [];
    const STAR_COUNT = 30;
    const CONNECT_DIST = 120;

    function resize() {
      w = canvas!.offsetWidth;
      h = canvas!.offsetHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    function init() {
      resize();
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.5 + 0.5,
        });
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const isDark = theme === "dark";
      const dotColor = isDark ? "rgba(34,197,94," : "rgba(239,68,68,";
      const lineColor = isDark ? "rgba(34,197,94," : "rgba(239,68,68,";

      // Update & draw stars
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0 || s.x > w) s.vx *= -1;
        if (s.y < 0 || s.y > h) s.vy *= -1;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = dotColor + "0.25)";
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.12;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.strokeStyle = lineColor + alpha + ")";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animFrame = requestAnimationFrame(draw);
    }

    init();
    draw();

    window.addEventListener("resize", () => { resize(); });

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-60"
    />
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace("/");
    }
  }, [user, loading]);

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const all = await fetchProjects();
        // Sort newest first, show up to 5
        setProjects(
          all
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5)
        );
      } catch {
        // silently fail — non-critical
      } finally {
        setLoadingProjects(false);
      }
    }
    load();
  }, [user]);

  if (!user) return null;

  return (
    <AppLayout>
      <div className="relative p-8">
        {/* Constellation background */}
        <ConstellationCanvas />

        <div className="relative z-10">
          {/* CASSIAN hero title */}
          <motion.div
            className="mb-10 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <h1
              className="text-glow-neon text-5xl font-bold tracking-[0.22em] text-neon"
              style={{ textShadow: "0 0 32px rgba(34,197,94,0.45), 0 0 8px rgba(34,197,94,0.25)" }}
            >
              CASSIAN
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.3em] text-neon/50">
              Code Analysis System for Software Intelligence &amp; Navigation
            </p>
          </motion.div>

          {/* Dashboard sub-header */}
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
          >
            <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
            <p className="mt-1 text-sm text-muted">
              Welcome back — your recent projects are below.
            </p>
          </motion.div>

          {/* Recent Projects */}
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Recent Projects
              </h2>
              <motion.a
                href="/repositories"
                className="text-xs text-neon/70 transition-colors hover:text-neon"
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
              >
                View all →
              </motion.a>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {loadingProjects && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
                </div>
              )}

              {!loadingProjects && projects.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mb-3 text-muted/40"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm text-muted">No projects yet</p>
                  <motion.a
                    href="/upload"
                    className="mt-3 rounded-lg border border-neon/40 bg-neon/10 px-4 py-1.5 text-xs font-semibold text-neon transition-all hover:bg-neon/20"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Upload your first project
                  </motion.a>
                </div>
              )}

              {!loadingProjects && projects.length > 0 && (
                <ul className="divide-y divide-border">
                  {projects.map((project, i) => (
                    <motion.li
                      key={project.id}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.28, ease: "easeOut" }}
                    >
                      {/* Source icon */}
                      <span className="shrink-0 text-muted">
                        {(project.type ?? project.source) === "github" ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        )}
                      </span>

                      {/* Name + date */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {project.name}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(project.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 gap-2">
                        <motion.button
                          onClick={() => router.push(`/repositories/${project.id}`)}
                          className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted transition-all hover:border-neon/40 hover:text-neon"
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          View
                        </motion.button>
                        <motion.button
                          onClick={() => router.push(`/chat?project=${project.id}`)}
                          className="rounded-lg border border-neon/40 bg-neon/10 px-3 py-1 text-xs font-medium text-neon transition-all hover:bg-neon/20"
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          Chat
                        </motion.button>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>

          {/* Bottom info cards */}
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" as const }}
          >
            {/* About card */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neon/60">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">About CASSIAN</p>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">
                <strong className="text-neon">CASSIAN</strong> — Code Analysis System for Software Intelligence &amp; Navigation.
                Upload repositories, generate intelligent summaries, and chat with your code in plain English.
              </p>
            </div>

            {/* System status */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neon/60">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">System Status</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: "AI Engine", status: "Multi-model Smart" },
                  { label: "Auth", status: "Secure Sign-in" },
                  { label: "Theme", status: "Dark / Light" },
                  { label: "Version", status: "v0.1.0" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted">{item.label}</span>
                    <span className="text-foreground/70">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
