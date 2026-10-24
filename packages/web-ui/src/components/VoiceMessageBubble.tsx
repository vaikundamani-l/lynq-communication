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

  const waveformHeights = [12, 18, 9, 24, 15, 11, 22, 14, 25, 10, 19, 13, 21, 15, 18, 12, 23, 14, 9, 16];

  return (
    <div className={`voice-bubble-container ${isPlaying ? 'playing' : ''}`}>
      <button
        onClick={togglePlay}
        className={`voice-play-btn ${isPlaying ? 'is-playing' : ''}`}
        title={isPlaying ? 'Pause' : 'Play Voice Note'}
      >
        <span className="play-icon">{isPlaying ? '⏸' : '▶'}</span>
      </button>

      {/* Dynamic Soundwave Equalizer Visualization */}
      <div className="voice-waveform-area">
        <div className="voice-bars-container">
          {waveformHeights.map((h, i) => {
            const isPlayed = i / waveformHeights.length <= currentTime / duration;
            return (
              <span
                key={i}
                className={`waveform-bar ${isPlayed ? 'played' : ''} ${isPlaying ? 'dancing' : ''}`}
                style={{
                  height: `${h}px`,
                  animationDelay: `${(i % 5) * 0.12}s`,
                }}
              />
            );
          })}
        </div>

        <div className="voice-meta-row">
          <span className="voice-time">
            {isPlaying ? formatSec(currentTime) : formatSec(duration)}
          </span>
          <span className="voice-format-pill">HD AUDIO</span>
        </div>
      </div>

      {/* Playback speed toggle */}
      <button
        onClick={cycleSpeed}
        className="voice-speed-pill"
        title="Playback Speed"
      >
        {speed}x
      </button>
    </div>
  );
};
