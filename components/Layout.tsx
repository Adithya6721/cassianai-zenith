"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import UserMenu from "@/components/UserMenu";
import ThemeToggle from "@/components/ThemeToggle";
import AssistantPanel from "@/components/AssistantPanel";

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background transition-theme">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-border bg-surface/80 px-6 backdrop-blur-sm transition-theme">
          <ThemeToggle />
          <UserMenu />
        </header>

        {/* Main content */}
        <main className="relative flex-1 overflow-y-auto">
          <div className="bg-dot-grid relative z-10 h-full">
            <motion.div
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="h-full"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>

      {/* Global assistant panel — slides in from right edge */}
      <AssistantPanel />
    </div>
  );
}
