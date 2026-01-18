"use client";

import { useEffect, useRef, useState } from "react";

interface AudioPlayButtonProps {
  src: string;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export function AudioPlayButton({ src, onEnded, autoPlay = false }: AudioPlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onEnded]);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      Promise.resolve(audioRef.current.play()).catch(() => {
        // Browser autoplay policies might block playback; safe to ignore.
      });
    }
  }, [autoPlay]);

  const handleClick = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
  };

  
  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={src} preload="none" />
      <button
        onClick={handleClick}
        className={`text-muted-foreground hover:text-foreground transition-colors rounded-md p-2 bg-background/30 border ${isPlaying ? 'border-secondary-foreground' : 'border-border'}`}
        aria-label="Play audio"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isPlaying ? "animate-pulse" : ""}
        >
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      </button>
    </div>
  );
}
