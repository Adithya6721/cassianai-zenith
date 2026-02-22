"use client";

import { useTheme } from "@/context/ThemeContext";

export default function CaspianEasterEgg() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const color = isDark ? "#22c55e" : "#ef4444";
  const glowColor = isDark
    ? "rgba(34, 197, 94, 0.3)"
    : "rgba(239, 68, 68, 0.3)";

  return (
    <div className="group fixed bottom-5 right-5 z-50" aria-hidden="true">
      {/* Tooltip */}
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-surface px-2.5 py-1 text-[10px] font-medium tracking-wider text-muted opacity-0 shadow-lg transition-opacity duration-300 group-hover:opacity-100">
        For Narnia
      </span>

      {/* Orbiting container */}
      <div
        className="relative flex h-7 w-7 items-center justify-center"
        style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
      >
        {/* Center dot */}
        <div
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, opacity: 0.6 }}
        />

        {/* Orbiting dot 1 */}
        <div className="animate-orbit absolute h-full w-full">
          <div
            className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color, opacity: 0.5 }}
          />
        </div>

        {/* Orbiting dot 2 */}
        <div className="animate-orbit-reverse absolute h-full w-full">
          <div
            className="absolute left-1/2 top-0 h-0.5 w-0.5 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color, opacity: 0.4 }}
          />
        </div>

        {/* Orbiting dot 3 */}
        <div className="animate-orbit-slow absolute h-full w-full">
          <div
            className="absolute left-1/2 top-0 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color, opacity: 0.35 }}
          />
        </div>
      </div>
    </div>
  );
}
