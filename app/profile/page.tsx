"use client";

import { motion } from "framer-motion";
import AppLayout from "@/components/Layout";
import { useAppearance, VisualMode } from "@/context/AppearanceContext";

const VISUAL_MODES: {
  id: VisualMode;
  name: string;
  description: string;
  preview: string;
}[] = [
  {
    id: "default",
    name: "Default",
    description: "Clean black/green neon (dark) or white/red (light)",
    preview: "🎨",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Electric purple + cyan, strong neon glow, futuristic terminal",
    preview: "⚡",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Flat UI, soft grayscale, professional dashboard style",
    preview: "✨",
  },
  {
    id: "cosmic",
    name: "Cosmic",
    description: "Deep space, blue + violet accents, floating UI feel",
    preview: "🌌",
  },
  {
    id: "matrix",
    name: "Matrix",
    description: "Green terminal glow, code rain, hacker aesthetic",
    preview: "💚",
  },
];

export default function ProfilePage() {
  const {
    visualMode,
    setVisualMode,
  } = useAppearance();

  return (
    <AppLayout>
      <div className="relative flex h-full flex-col overflow-y-auto p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-semibold text-foreground">
            Profile & Customization
          </h1>
          <p className="mt-1 text-sm text-muted">
            Personalize your CASSIAN experience with visual themes and custom backgrounds.
          </p>
        </motion.div>

        {/* Visual Modes Section */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className="text-lg font-semibold text-foreground">Visual Modes</h2>
          <p className="mt-1 text-xs text-muted">
            Choose a theme that matches your style. Changes apply instantly.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VISUAL_MODES.map((mode) => {
              const isActive = visualMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  onClick={() => setVisualMode(mode.id)}
                  className={`relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${
                    isActive
                      ? "border-neon bg-neon/10"
                      : "border-border bg-surface hover:border-neon/30 hover:bg-surface-hover"
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{mode.preview}</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{mode.name}</h3>
                      <p className="mt-1 text-xs text-muted">{mode.description}</p>
                    </div>
                  </div>
                  {isActive && (
                    <motion.div
                      className="absolute right-3 top-3"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
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
                        className="text-neon"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
