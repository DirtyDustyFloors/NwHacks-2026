"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import Plyr from "plyr";
import { cn } from "@/lib/utils";

interface PlyrAudioPlayerProps {
  src: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

interface PlyrAudioPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
}

const PlyrAudioPlayer = forwardRef<PlyrAudioPlayerHandle, PlyrAudioPlayerProps>(
  ({ src, className, onPlay, onPause, onEnded }, ref) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const plyrInstanceRef = useRef<Plyr | null>(null);

    useEffect(() => {
      if (!audioRef.current || plyrInstanceRef.current) return;

      const plyr = new Plyr(audioRef.current, {
        controls: ["play-large", "play", "progress", "current-time", "mute", "volume"],
        settings: ["speed"],
        speed: {
          selected: 1,
          options: [0.5, 0.75, 1, 1.25, 1.5, 2],
        },
        hideControls: false,
      });

      plyrInstanceRef.current = plyr;

      const handlePlay = () => {
        if (onPlay) onPlay();
      };
      const handlePause = () => {
        if (onPause) onPause();
      };
      const handleEnded = () => {
        if (onEnded) onEnded();
      };

      plyr.on("play", handlePlay);
      plyr.on("pause", handlePause);
      plyr.on("ended", handleEnded);

      return () => {
        plyrInstanceRef.current = null;
        plyr.destroy();
      };
    }, [src, onPlay, onPause, onEnded]);

    useImperativeHandle(ref, () => ({
      play: () => plyrInstanceRef.current?.play(),
      pause: () => plyrInstanceRef.current?.pause(),
      seek: (time) => (plyrInstanceRef.current as any)?.seek(time),
    }));

    return (
      <audio
        ref={audioRef}
        src={src}
        className={cn(className)}
        controls
      />
    );
  }
);

PlyrAudioPlayer.displayName = "PlyrAudioPlayer";

export { PlyrAudioPlayer, type PlyrAudioPlayerHandle };
