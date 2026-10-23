export type MessageType = 'text' | 'file' | 'voice' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type ConversationType = 'direct' | 'group';

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256Hash: string;
  thumbnailUrl?: string;
  durationSeconds?: number; // for audio/voice notes or video
  isDownloaded?: boolean;
  localPath?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string; // Contact uid or Group id
  conversationId: string;
  conversationType: ConversationType;
  type: MessageType;
  content: string;
  timestamp: number; // UTC epoch ms
  status: MessageStatus;
  replyToId?: string;
  forwardedFromId?: string;
  reactions: Record<string, string[]>; // emoji -> [userIds]
  isEdited: boolean;
  editedAt?: number;
  isDeleted: boolean;
  isPinned: boolean;
  fileMetadata?: FileMetadata;
}

export interface MessageAck {
  messageId: string;
  status: MessageStatus;
  recipientId: string;
  timestamp: number;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  timestamp: number;
}
