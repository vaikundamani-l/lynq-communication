export class NotificationService {
  private hasPermission = false;
  private audioCtx: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.hasPermission = Notification.permission === 'granted';
    }
  }

  /**
   * Explicitly requests notification permissions from user
   */
  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.hasPermission = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      this.hasPermission = result === 'granted';
      return this.hasPermission;
    }

    return false;
  }

  /**
   * Plays a subtle synthesized chime using Web Audio API (zero external assets needed)
   */
  public playChime(type: 'message' | 'call' | 'transfer' = 'message'): void {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'message') {
        // High crisp double-tone chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'call') {
        // Ringing melody
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.15);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // File transfer soft ping
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // Audio autoplay may be constrained by browser policy; silently fail
    }
  }

  /**
   * Displays system notification if window is backgrounded or permitted
   */
  public showMessageNotification(senderName: string, content: string): void {
    this.playChime('message');

    if (this.hasPermission && document.hidden) {
      try {
        new Notification(`LYNQ: ${senderName}`, {
          body: content.slice(0, 100),
          icon: '/favicon.ico',
        });
      } catch {
        // ignore
      }
    }
  }

  public showTransferNotification(senderName: string, fileName: string): void {
    this.playChime('transfer');

    if (this.hasPermission && document.hidden) {
      try {
        new Notification('LYNQ: Incoming File Transfer', {
          body: `${senderName} wants to send ${fileName}`,
          icon: '/favicon.ico',
        });
      } catch {
        // ignore
      }
    }
  }

  public showCallNotification(callerName: string, type: 'voice' | 'video' = 'voice'): void {
    this.playChime('call');

    if (this.hasPermission && document.hidden) {
      try {
        new Notification(`LYNQ: Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`, {
          body: `${callerName} is calling you...`,
          icon: '/favicon.ico',
        });
      } catch {
        // ignore
      }
    }
  }

  public updateUnreadBadge(count: number): void {
    if (typeof document === 'undefined') return;
    if (count > 0) {
      document.title = `(${count}) LYNQ Communication`;
    } else {
      document.title = 'LYNQ Communication';
    }
  }
}
