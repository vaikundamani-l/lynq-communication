import { Message, Contact, SignalingEnvelope, generateUUID } from '@lynq/core';

export type LynqClientEvent = 
  | { type: 'message'; payload: Message }
  | { type: 'ack'; payload: { messageId: string; status: string } }
  | { type: 'contact'; payload: Contact }
  | { type: 'status'; payload: { connected: boolean; url: string } };

export class LynqClient {
  private ws: WebSocket | null = null;
  private url: string;
  private myUid: string;
  private listeners: ((event: LynqClientEvent) => void)[] = [];
  private reconnectTimer: any = null;

  constructor(myUid: string, url = 'ws://127.0.0.1:4848') {
    this.myUid = myUid;
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
        // Register client
        this.sendEnvelope({
          id: generateUUID(),
          type: 'ping',
          senderId: this.myUid,
          recipientId: 'server',
          timestamp: Date.now(),
          payload: null,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope: SignalingEnvelope = JSON.parse(event.data);
          if (envelope.type === 'msg:send') {
            this.emit({ type: 'message', payload: envelope.payload as Message });
          } else if (envelope.type === 'msg:ack') {
            this.emit({ type: 'ack', payload: envelope.payload as any });
          }
        } catch {
          // ignore invalid envelope
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

  public sendMessage(recipientId: string, content: string): Message {
    const convId = [this.myUid, recipientId].sort().join('_');
    const msg: Message = {
      id: generateUUID(),
      senderId: this.myUid,
      receiverId: recipientId,
      conversationId: convId,
      conversationType: 'direct',
      type: 'text',
      content,
      timestamp: Date.now(),
      status: this.ws && this.ws.readyState === WebSocket.OPEN ? 'sent' : 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    this.sendEnvelope({
      id: generateUUID(),
      type: 'msg:send',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: msg,
    });

    return msg;
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
