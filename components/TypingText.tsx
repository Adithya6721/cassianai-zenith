"use client";

import { useEffect, useState, useRef } from "react";

interface TypingTextProps {
  text: string;
  speed?: number; // Characters per second (default: 50)
  onComplete?: () => void;
  className?: string;
}

export default function TypingText({
  text,
  speed = 50,
  onComplete,
  className = "",
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText("");
    setIsComplete(false);
    indexRef.current = 0;
    lastUpdateRef.current = performance.now();

    const msPerChar = 1000 / speed;

    function animate(timestamp: number) {
      const elapsed = timestamp - lastUpdateRef.current;

      if (elapsed >= msPerChar) {
        const charsToAdd = Math.floor(elapsed / msPerChar);
        lastUpdateRef.current = timestamp;

        const newIndex = Math.min(
          indexRef.current + charsToAdd,
          text.length
        );

        if (newIndex > indexRef.current) {
          indexRef.current = newIndex;
          setDisplayedText(text.slice(0, newIndex));
        }

        if (newIndex >= text.length) {
          setIsComplete(true);
          if (onComplete) {
            onComplete();
          }
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    if (text.length > 0) {
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      setIsComplete(true);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [text, speed, onComplete]);

  return <span className={className}>{displayedText}</span>;
}
