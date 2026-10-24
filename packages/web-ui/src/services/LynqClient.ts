import {
  Message,
  Contact,
  SignalingEnvelope,
  generateUUID,
  TypingIndicator,
} from '@lynq/core';

export type LynqClientEvent =
  | { type: 'message'; payload: Message }
  | { type: 'ack'; payload: { messageId: string; status: string } }
  | { type: 'typing'; payload: TypingIndicator }
  | { type: 'reaction'; payload: { messageId: string; userId: string; emoji: string; action: 'add' | 'remove' } }
  | { type: 'edit'; payload: { messageId: string; content: string; editedAt: number } }
  | { type: 'delete'; payload: { messageId: string } }
  | { type: 'contact'; payload: Contact }
  | { type: 'status'; payload: { connected: boolean; url: string } }
  | { type: 'signaling'; payload: SignalingEnvelope };

export const getDefaultSignalingUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    return `${protocol}//${host}:4848`;
  }
  return 'ws://127.0.0.1:4848';
};

export class LynqClient {
  private ws: WebSocket | null = null;
  private url: string;
  private myUid: string;
  private username: string;
  private listeners: ((event: LynqClientEvent) => void)[] = [];
  private reconnectTimer: any = null;
  private typingTimer: any = null;

  constructor(myUid: string, username = 'Peer', url = getDefaultSignalingUrl()) {
    this.myUid = myUid;
    this.username = username;
    this.url = url;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.emit({ type: 'status', payload: { connected: true, url: this.url } });
        // Register client presence on daemon
        this.sendEnvelope({
          id: generateUUID(),
          type: 'presence:update',
          senderId: this.myUid,
          recipientId: 'server',
          timestamp: Date.now(),
          payload: {
            uid: this.myUid,
            username: this.username,
            ipAddress: typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1',
            port: 4848,
            status: 'online',
            isPaired: true,
            lastSeen: Date.now(),
            deviceInfo: {
              deviceId: 'dev_' + this.myUid,
              deviceName: this.username,
              platform:
                typeof navigator !== 'undefined' && /android|iphone|ipad|mobile/i.test(navigator.userAgent)
                  ? 'android'
                  : 'linux',
              appVersion: '0.1.0',
            },
          },
        });
        // Request persistent message history from daemon SQLite storage
        this.requestHistorySync();
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope: SignalingEnvelope = JSON.parse(event.data);
          this.emit({ type: 'signaling', payload: envelope });
          switch (envelope.type) {
            case 'presence:update':
              this.emit({ type: 'contact', payload: envelope.payload as Contact });
              break;
            case 'presence:list':
              const peers = envelope.payload as Contact[];
              if (Array.isArray(peers)) {
                peers.forEach((peer) => {
                  this.emit({ type: 'contact', payload: peer });
                });
              }
              break;
            case 'msg:send':
              this.emit({ type: 'message', payload: envelope.payload as Message });
              break;
            case 'msg:ack':
              this.emit({ type: 'ack', payload: envelope.payload as any });
              break;
            case 'msg:typing':
              this.emit({ type: 'typing', payload: envelope.payload as TypingIndicator });
              break;
            case 'msg:react':
              this.emit({ type: 'reaction', payload: envelope.payload as any });
              break;
            case 'msg:edit':
              this.emit({ type: 'edit', payload: envelope.payload as any });
              break;
            case 'msg:delete':
              this.emit({ type: 'delete', payload: envelope.payload as any });
              break;
            case 'msg:sync_response':
              const syncMsgs = envelope.payload as Message[];
              if (Array.isArray(syncMsgs)) {
                syncMsgs.forEach((msg) => {
                  this.emit({ type: 'message', payload: msg });
                });
              }
              break;
          }
        } catch {
          // ignore malformed envelope
        }
      };

      this.ws.onclose = () => {
        this.emit({ type: 'status', payload: { connected: false, url: this.url } });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public sendEnvelope(envelope: SignalingEnvelope): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
      return true;
    }
    return false;
  }

  public requestHistorySync(conversationId?: string, limit = 200): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:sync_request',
      senderId: this.myUid,
      recipientId: 'server',
      timestamp: Date.now(),
      payload: { conversationId, limit },
    });
  }

  public sendMessage(recipientIdOrMsg: string | Message, content?: string, replyToId?: string): Message {
    let msg: Message;
    let recipientId: string;

    if (typeof recipientIdOrMsg === 'object') {
      msg = recipientIdOrMsg;
      recipientId = msg.receiverId;
    } else {
      recipientId = recipientIdOrMsg;
      const convId = [this.myUid, recipientId].sort().join('_');
      msg = {
        id: generateUUID(),
        senderId: this.myUid,
        receiverId: recipientId,
        conversationId: convId,
        conversationType: 'direct',
        type: 'text',
        content: content || '',
        timestamp: Date.now(),
        status: this.ws && this.ws.readyState === WebSocket.OPEN ? 'sent' : 'pending',
        replyToId,
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };
    }

    this.sendEnvelope({
      id: msg.id || generateUUID(),
      type: 'msg:send',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: msg,
    });

    return msg;
  }

  public sendReadReceipt(senderId: string, messageId: string): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:ack',
      senderId: this.myUid,
      recipientId: senderId,
      timestamp: Date.now(),
      payload: {
        messageId,
        status: 'read',
        recipientId: this.myUid,
        timestamp: Date.now(),
      },
    });
  }

  public sendTyping(recipientId: string, conversationId: string): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:typing',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        conversationId,
        userId: this.myUid,
        isTyping: true,
        timestamp: Date.now(),
      },
    });

    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }

    this.typingTimer = setTimeout(() => {
      this.sendEnvelope({
        id: generateUUID(),
        type: 'msg:typing',
        senderId: this.myUid,
        recipientId,
        timestamp: Date.now(),
        payload: {
          conversationId,
          userId: this.myUid,
          isTyping: false,
          timestamp: Date.now(),
        },
      });
      this.typingTimer = null;
    }, 2500);
  }

  public sendReaction(recipientId: string, messageId: string, emoji: string, action: 'add' | 'remove'): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:react',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
        userId: this.myUid,
        emoji,
        action,
      },
    });
  }

  public sendEdit(recipientId: string, messageId: string, content: string): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:edit',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
        content,
        editedAt: Date.now(),
      },
    });
  }

  public sendDelete(recipientId: string, messageId: string): void {
    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:delete',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
      },
    });
  }

  public updateUsername(newName: string): void {
    this.username = newName;
    this.sendEnvelope({
      id: generateUUID(),
      type: 'presence:update',
      senderId: this.myUid,
      recipientId: 'server',
      timestamp: Date.now(),
      payload: {
        uid: this.myUid,
        username: newName,
        status: 'online',
        lastSeen: Date.now(),
      },
    });
  }

  public subscribe(cb: (event: LynqClientEvent) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(event: LynqClientEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
