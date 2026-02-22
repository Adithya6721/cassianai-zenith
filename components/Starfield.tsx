"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useAppearance } from "@/context/AppearanceContext";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  baseOpacity: number;
  vx: number;
  vy: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

// Theme-specific configurations
const THEME_CONFIGS = {
  // Dark mode: White + Cyan glow
  dark: {
    colors: ["#FFFFFF", "#7DF9FF"],
    speed: 1,
    count: 150,
    glowIntensity: 0.6,
  },
  // Light mode: Soft Blue + Silver (lower glow)
  light: {
    colors: ["#9AD0FF", "#E6E6E6"],
    speed: 1,
    count: 120,
    glowIntensity: 0.3,
  },
};

// Visual mode configurations
const VISUAL_MODE_CONFIGS = {
  default: {
    colors: ["#FFFFFF", "#7DF9FF"],
    speed: 1,
    count: 150,
    glowIntensity: 0.6,
  },
  // Cyberpunk: Electric Blue + Neon Pink, faster movement, pulse glow
  cyberpunk: {
    colors: ["#00F5FF", "#FF2D9A"],
    speed: 1.5,
    count: 180,
    glowIntensity: 0.8,
  },
  minimal: {
    colors: ["#FFFFFF", "#7DF9FF"],
    speed: 1,
    count: 100,
    glowIntensity: 0.4,
  },
  // Cosmic (Aurora): Green + Soft White, very slow drifting
  cosmic: {
    colors: ["#00FFB3", "#FFFFFF"],
    speed: 0.5,
    count: 140,
    glowIntensity: 0.5,
  },
  // Matrix: Green digital sparks, flicker animation
  matrix: {
    colors: ["#00FF41"],
    speed: 1,
    count: 200,
    glowIntensity: 0.4,
  },
};

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const { theme } = useTheme();
  const { visualMode } = useAppearance();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    // Get theme config
    const getConfig = () => {
      // Visual mode takes precedence over theme
      if (visualMode && visualMode !== "default" && visualMode in VISUAL_MODE_CONFIGS) {
        return VISUAL_MODE_CONFIGS[visualMode as keyof typeof VISUAL_MODE_CONFIGS];
      }
      return THEME_CONFIGS[theme as keyof typeof THEME_CONFIGS] || THEME_CONFIGS.dark;
    };

    // Initialize stars
    const initStars = () => {
      const config = getConfig();
      const stars: Star[] = [];

      for (let i = 0; i < config.count; i++) {
        const color = config.colors[Math.floor(Math.random() * config.colors.length)];
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: 1 + Math.random() * 2, // 1-3px random size
          opacity: 0.3 + Math.random() * 0.7,
          baseOpacity: 0.3 + Math.random() * 0.7,
          vx: (Math.random() - 0.5) * 0.3 * config.speed,
          vy: (Math.random() - 0.5) * 0.3 * config.speed,
          twinkleSpeed: 0.01 + Math.random() * 0.02,
          twinklePhase: Math.random() * Math.PI * 2,
          color,
        });
      }

      starsRef.current = stars;
    };

    initStars();

    // Animation loop
    let lastTime = Date.now();
    const animate = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastTime) / 16.67, 2); // Cap at 2x normal speed
      lastTime = now;

      const config = getConfig();
      const isMatrix = visualMode === "matrix";
      const isCyberpunk = visualMode === "cyberpunk";

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw stars
      starsRef.current.forEach((star) => {
        // Update position (floating motion)
        star.x += star.vx * deltaTime;
        star.y += star.vy * deltaTime;

        // Wrap around edges
        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;

        // Update twinkle (occasional twinkle effect)
        star.twinklePhase += star.twinkleSpeed * deltaTime;
        const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
        star.opacity = star.baseOpacity * twinkle;

        // Matrix mode flicker animation
        if (isMatrix && Math.random() < 0.02) {
          star.opacity *= Math.random() * 0.5 + 0.5;
        }

        // Draw star with soft glow
        const gradient = ctx.createRadialGradient(
          star.x,
          star.y,
          0,
          star.x,
          star.y,
          star.size * 2
        );
        gradient.addColorStop(0, star.color);
        gradient.addColorStop(1, `${star.color}00`);

        ctx.globalAlpha = star.opacity;
        ctx.fillStyle = gradient;
        ctx.shadowBlur = star.size * config.glowIntensity * 10;
        ctx.shadowColor = star.color;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Cyberpunk occasional pulse glow
        if (isCyberpunk && Math.random() < 0.01) {
          ctx.shadowBlur = star.size * 20;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, [theme, visualMode]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        width: "100%",
        height: "100%",
      }}
      aria-hidden="true"
    />
  );
}
