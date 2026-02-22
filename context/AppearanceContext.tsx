"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type VisualMode = "default" | "cyberpunk" | "minimal" | "cosmic" | "matrix";

interface AppearanceContextValue {
  visualMode: VisualMode;
  setVisualMode: (mode: VisualMode) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  visualMode: "default",
  setVisualMode: () => {},
});

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [visualMode, setVisualModeState] = useState<VisualMode>("default");
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem("cassian-visual-mode") as VisualMode;

    if (savedMode && ["default", "cyberpunk", "minimal", "cosmic", "matrix"].includes(savedMode)) {
      setVisualModeState(savedMode);
    }

    // Clean up old custom background settings
    localStorage.removeItem("cassian-custom-bg");
    localStorage.removeItem("cassian-bg-opacity");

    setMounted(true);
  }, []);

  // Apply visual mode to document
  useEffect(() => {
    if (!mounted) return;

    // Remove all mode classes
    document.documentElement.classList.remove(
      "mode-default",
      "mode-cyberpunk",
      "mode-minimal",
      "mode-cosmic",
      "mode-matrix"
    );

    // Add current mode class
    document.documentElement.classList.add(`mode-${visualMode}`);
  }, [visualMode, mounted]);

  const setVisualMode = useCallback((mode: VisualMode) => {
    setVisualModeState(mode);
    localStorage.setItem("cassian-visual-mode", mode);
  }, []);

  return (
    <AppearanceContext.Provider
      value={{
        visualMode,
        setVisualMode,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
