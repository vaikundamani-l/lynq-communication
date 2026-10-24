import { Message, MessageAck, TypingIndicator } from '../models/Message.js';
import { Contact, PairingRequest } from '../models/Contact.js';
import { FileTransfer, FileChunk } from '../models/FileTransfer.js';
import { CallSession } from '../models/Call.js';

export type SignalingType =
  // Discovery & Pairing
  | 'discovery:announce'
  | 'discovery:query'
  | 'pairing:request'
  | 'pairing:response'
  | 'pairing:accept'
  | 'pairing:reject'
  // WebRTC Negotiation
  | 'webrtc:offer'
  | 'webrtc:answer'
  | 'webrtc:ice-candidate'
  // Direct Messaging
  | 'msg:send'
  | 'msg:ack'
  | 'msg:typing'
  | 'msg:edit'
  | 'msg:delete'
  | 'msg:react'
  | 'msg:sync_request'
  | 'msg:sync_response'
  // File Transfer
  | 'transfer:offer'
  | 'transfer:accept'
  | 'transfer:reject'
  | 'transfer:chunk'
  | 'transfer:ack'
  | 'transfer:chunk_ack'
  | 'transfer:complete'
  | 'transfer:cancel'
  // Authentication & Error
  | 'auth:register'
  | 'auth:response'
  | 'error'
  // Calling
  | 'call:invite'
  | 'call:ring'
  | 'call:accept'
  | 'call:reject'
  | 'call:hangup'
  | 'call:reconnect'
  // Heartbeat & Presence
  | 'ping'
  | 'pong'
  | 'presence:update'
  | 'presence:list';

export interface SignalingEnvelope<T = unknown> {
  id: string;
  type: SignalingType;
  senderId: string;
  recipientId: string;
  timestamp: number;
  payload: T;
}

export interface WebRtcOfferPayload {
  conversationId: string;
  sdp: string;
  mediaType?: 'data' | 'voice' | 'video';
}

export interface WebRtcAnswerPayload {
  conversationId: string;
  sdp: string;
}

export interface WebRtcIceCandidatePayload {
  conversationId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export interface ReactionPayload {
  messageId: string;
  userId: string;
  emoji: string;
  action: 'add' | 'remove';
}
