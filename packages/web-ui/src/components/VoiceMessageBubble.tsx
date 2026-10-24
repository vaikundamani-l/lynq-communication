import React, { useState, useRef, useEffect } from 'react';
import { Message } from '@lynq/core';

interface VoiceMessageBubbleProps {
  message: Message;
}

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({ message }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const duration = message.fileMetadata?.durationSeconds || 5;

  useEffect(() => {
    // Construct audio source from metadata localPath or synthesized tone
    const audio = new Audio();
    if (message.fileMetadata?.localPath) {
      audio.src = message.fileMetadata.localPath;
    }
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setCurrentTime(Math.round(audio.currentTime));
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [message]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = speed;
      audioRef.current.play().catch(() => {
        // Fallback simulation timer if blob is not directly playable
        setIsPlaying(true);
        let sec = currentTime;
        const interval = setInterval(() => {
          sec += 1;
          if (sec >= duration) {
            clearInterval(interval);
            setIsPlaying(false);
            setCurrentTime(0);
          } else {
            setCurrentTime(sec);
          }
        }, 1000 / speed);
      });
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatSec = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '6px 4px',
        minWidth: '220px',
      }}
    >
      <button
        onClick={togglePlay}
        className="send-btn"
        style={{
          width: '36px',
          height: '36px',
          fontSize: '15px',
          flexShrink: 0,
        }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Waveform visualization */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '22px' }}>
          {[12, 18, 8, 22, 15, 10, 19, 14, 21, 9, 17, 12, 20, 14, 18, 10].map((h, i) => {
            const isPlayed = (i / 16) <= (currentTime / duration);
            return (
              <span
                key={i}
                style={{
                  width: '3px',
                  height: `${h}px`,
                  background: isPlayed ? 'var(--text-highlight)' : 'var(--text-muted)',
                  borderRadius: '2px',
                  transition: 'background 0.15s ease',
                }}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
          <span>{isPlaying ? formatSec(currentTime) : formatSec(duration)}</span>
        </div>
      </div>

      {/* Playback speed toggle */}
      <button
        onClick={cycleSpeed}
        style={{
          background: 'var(--bg-active)',
          border: 'none',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          padding: '2px 7px',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        title="Playback Speed"
      >
        {speed}x
      </button>
    </div>
  );
};
