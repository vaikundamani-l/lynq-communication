export type CallType = 'voice' | 'video';
export type CallStatus =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'rejected'
  | 'busy'
  | 'failed';

export interface CallSession {
  callId: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  type: CallType;
  status: CallStatus;
  startedAt?: number;
  connectedAt?: number;
  endedAt?: number;
  durationSeconds: number;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  endReason?: string;
}
