"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";

export default function WelcomePage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      window.location.replace("/home");
    }
  }, [user, loading]);

  // Don't render welcome screen if user is logged in (prevents flash)
  if (user) return null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-transparent px-6 py-20">
      {/* Radial accent glow behind content */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse at center, rgba(34,197,94,0.04) 0%, transparent 60%)"
            : "radial-gradient(ellipse at center, rgba(239,68,68,0.04) 0%, transparent 60%)",
        }}
      />

      {/* Theme toggle top-right */}
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-12 text-center">
        {/* Brand Section */}
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Logo */}
          <div>
            <h1 className="animate-logo-glow text-6xl font-bold tracking-widest text-neon sm:text-7xl md:text-8xl">
              CASSIAN
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.3em] text-neon/50">
              .AI
            </p>
          </div>

          {/* Subtitle */}
          <p className="max-w-lg text-[11px] font-medium uppercase tracking-[0.25em] text-muted/60">
            Code Analysis System for Software Intelligence &amp; Navigation
          </p>

          {/* Divider */}
          <div className="h-px w-24 bg-linear-to-r from-transparent via-neon/40 to-transparent" />

          {/* Description */}
          <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Upload code repositories and gain instant insights. Chat with your codebase, explore architecture, and understand any project in seconds.
          </p>
        </motion.div>

        {/* Google Sign-In Button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="group relative overflow-hidden rounded-xl border border-border bg-surface px-8 py-4 text-sm font-medium text-foreground transition-all duration-300 hover:border-neon/40 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Hover glow effect */}
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div
                className="absolute inset-0"
                style={{
                  background: isDark
                    ? "radial-gradient(circle at center, rgba(34,197,94,0.08) 0%, transparent 70%)"
                    : "radial-gradient(circle at center, rgba(239,68,68,0.08) 0%, transparent 70%)",
                }}
              />
            </div>

            <span className="relative flex items-center gap-3">
              {/* Google Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </span>
          </button>
        </motion.div>
      </div>

      {/* Narnia easter egg — bottom-left */}
      <motion.div
        className="group absolute bottom-6 left-6 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        <span className="pointer-events-none absolute bottom-full left-0 mb-2 whitespace-nowrap rounded-md bg-surface px-2.5 py-1 text-[10px] font-medium tracking-wider text-muted opacity-0 shadow-lg transition-opacity duration-300 group-hover:opacity-100">
          For Narnia
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-narnia-glow text-neon/30 transition-colors duration-300 group-hover:text-neon/70"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </motion.div>

      {/* Bottom version tag */}
      <motion.p
        className="absolute bottom-6 text-xs tracking-widest text-muted/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        v0.1.0
      </motion.p>
    </div>
  );
}
