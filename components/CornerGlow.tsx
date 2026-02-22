"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";

interface Particle {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  vx: number;
  vy: number;
  pulsePhase: number;
  pulseSpeed: number;
}

const PARTICLE_COUNT = 7;
const GLOW_SIZE = 180; // Size of the corner glow area

export default function CornerGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = GLOW_SIZE;
    canvas.height = GLOW_SIZE;

    // Initialize particles if needed
    if (particlesRef.current.length === 0) {
      const particles: Particle[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * GLOW_SIZE * 0.7,
          y: GLOW_SIZE - Math.random() * GLOW_SIZE * 0.7,
          radius: Math.random() * 2 + 1,
          opacity: Math.random() * 0.4 + 0.2,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.01,
        });
      }
      particlesRef.current = particles;
    }

    const isDark = theme === "dark";
    // Dark theme: green (accent green), Light theme: red
    const r = isDark ? 34 : 239;
    const g = isDark ? 197 : 68;
    const b = isDark ? 94 : 68;

    let frame = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, GLOW_SIZE, GLOW_SIZE);

      frame++;
      const particles = particlesRef.current;

      for (const p of particles) {
        // Gentle drift
        p.x += p.vx;
        p.y += p.vy;

        // Keep particles in bottom-left area
        if (p.x < 0 || p.x > GLOW_SIZE * 0.8) p.vx *= -1;
        if (p.y < GLOW_SIZE * 0.2 || p.y > GLOW_SIZE) p.vy *= -1;

        // Clamp position
        p.x = Math.max(0, Math.min(GLOW_SIZE * 0.8, p.x));
        p.y = Math.max(GLOW_SIZE * 0.2, Math.min(GLOW_SIZE, p.y));

        // Pulse
        const pulse = Math.sin(frame * p.pulseSpeed + p.pulsePhase);
        const currentOpacity = p.opacity + pulse * 0.15;
        const clampedOpacity = Math.max(0.1, Math.min(0.6, currentOpacity));

        // Draw particle with soft glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 8);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${clampedOpacity})`);
        gradient.addColorStop(0.3, `rgba(${r},${g},${b},${clampedOpacity * 0.4})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${clampedOpacity * 0.8})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed bottom-0 left-0 z-[5]"
      style={{ width: `${GLOW_SIZE}px`, height: `${GLOW_SIZE}px` }}
      aria-hidden="true"
    />
  );
}
