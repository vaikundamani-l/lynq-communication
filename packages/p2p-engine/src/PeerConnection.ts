import {
  Message,
  MessageAck,
  TypingIndicator,
  SignalingEnvelope,
  generateUUID,
} from '@lynq/core';

export type PeerConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export interface DataChannelMessage<T = unknown> {
  id: string;
  type:
    | 'msg'
    | 'ack'
    | 'read'
    | 'typing'
    | 'reaction'
    | 'edit'
    | 'delete'
    | 'ping'
    | 'pong';
  senderId: string;
  timestamp: number;
  payload: T;
}

export interface PeerConnectionCallbacks {
  onStateChange: (state: PeerConnectionState) => void;
  onMessage: (message: Message) => void;
  onAck: (ack: MessageAck) => void;
  onReadReceipt: (receipt: { messageId: string; readerId: string; timestamp: number }) => void;
  onTyping: (typing: TypingIndicator) => void;
  onReaction: (reaction: { messageId: string; userId: string; emoji: string; action: 'add' | 'remove' }) => void;
  onEdit: (edit: { messageId: string; content: string; editedAt: number }) => void;
  onDelete: (del: { messageId: string }) => void;
  onSignalNeeded: (envelope: SignalingEnvelope) => void;
}

export class LynqPeerConnection {
  public peerUid: string;
  public myUid: string;
  public state: PeerConnectionState = 'disconnected';
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private callbacks: PeerConnectionCallbacks;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // ICE Servers (Local LAN defaults with public STUN fallback if needed)
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  constructor(
    myUid: string,
    peerUid: string,
    callbacks: PeerConnectionCallbacks,
    customIceServers?: RTCIceServer[]
  ) {
    this.myUid = myUid;
    this.peerUid = peerUid;
    this.callbacks = callbacks;
    if (customIceServers) {
      this.iceServers = customIceServers;
    }
  }

  public initialize(isInitiator: boolean): void {
    if (typeof RTCPeerConnection === 'undefined') {
      // Running in environment without native WebRTC (e.g. Node test environment)
      this.setState('disconnected');
      return;
    }

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.setState('connecting');

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSignalNeeded({
          id: generateUUID(),
          type: 'webrtc:ice-candidate',
          senderId: this.myUid,
          recipientId: this.peerUid,
          timestamp: Date.now(),
          payload: {
            conversationId: [this.myUid, this.peerUid].sort().join('_'),
            candidate: event.candidate.toJSON(),
          },
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      switch (this.pc.connectionState) {
        case 'connected':
          this.setState('connected');
          break;
        case 'disconnected':
          this.setState('reconnecting');
          break;
        case 'failed':
          this.setState('failed');
          break;
        case 'closed':
          this.setState('closed');
          break;
      }
    };

    if (isInitiator) {
      const dc = this.pc.createDataChannel('lynq-data', {
        ordered: true,
      });
      this.setupDataChannel(dc);
      this.createAndSendOffer();
    } else {
      this.pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };
    }
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.callbacks.onSignalNeeded({
        id: generateUUID(),
        type: 'webrtc:offer',
        senderId: this.myUid,
        recipientId: this.peerUid,
        timestamp: Date.now(),
        payload: {
          conversationId: [this.myUid, this.peerUid].sort().join('_'),
          sdp: offer.sdp || '',
        },
      });
    } catch (err) {
      this.setState('failed');
    }
  }

  public async handleRemoteOffer(sdp: string): Promise<void> {
    if (!this.pc) {
      this.initialize(false);
    }
    if (!this.pc) return;

    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp });
      await this.drainPendingIceCandidates();

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.callbacks.onSignalNeeded({
        id: generateUUID(),
        type: 'webrtc:answer',
        senderId: this.myUid,
        recipientId: this.peerUid,
        timestamp: Date.now(),
        payload: {
          conversationId: [this.myUid, this.peerUid].sort().join('_'),
          sdp: answer.sdp || '',
        },
      });
    } catch {
      this.setState('failed');
    }
  }

  public async handleRemoteAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
      await this.drainPendingIceCandidates();
    } catch {
      this.setState('failed');
    }
  }

  public async handleRemoteIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!candidateInit) return;

    // If RTCPeerConnection is not initialized or remote description is not yet set,
    // buffer candidate to prevent native InvalidStateError exceptions
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingIceCandidates.push(candidateInit);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      console.warn('LynqPeerConnection addIceCandidate error (non-fatal):', err);
    }
  }

  private async drainPendingIceCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription || this.pendingIceCandidates.length === 0) {
      return;
    }

    const queue = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];

    for (const cand of queue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('LynqPeerConnection drained ICE candidate error (non-fatal):', err);
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      this.setState('connected');
    };

    channel.onclose = () => {
      this.setState('disconnected');
    };

    channel.onmessage = (event) => {
      this.handleIncomingData(event.data);
    };
  }

  private handleIncomingData(raw: string): void {
    try {
      const packet: DataChannelMessage = JSON.parse(raw);
      switch (packet.type) {
        case 'msg':
          this.callbacks.onMessage(packet.payload as Message);
          break;
        case 'ack':
          this.callbacks.onAck(packet.payload as MessageAck);
          break;
        case 'read':
          this.callbacks.onReadReceipt(packet.payload as any);
          break;
        case 'typing':
          this.callbacks.onTyping(packet.payload as TypingIndicator);
          break;
        case 'reaction':
          this.callbacks.onReaction(packet.payload as any);
          break;
        case 'edit':
          this.callbacks.onEdit(packet.payload as any);
          break;
        case 'delete':
          this.callbacks.onDelete(packet.payload as any);
          break;
      }
    } catch {
      // ignore invalid data
    }
  }

  public sendData<T>(type: DataChannelMessage['type'], payload: T): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }

    const packet: DataChannelMessage<T> = {
      id: generateUUID(),
      type,
      senderId: this.myUid,
      timestamp: Date.now(),
      payload,
    };

    this.dataChannel.send(JSON.stringify(packet));
    return true;
  }

  public sendMessage(msg: Message): boolean {
    return this.sendData('msg', msg);
  }

  public sendAck(ack: MessageAck): boolean {
    return this.sendData('ack', ack);
  }

  public sendReadReceipt(messageId: string): boolean {
    return this.sendData('read', {
      messageId,
      readerId: this.myUid,
      timestamp: Date.now(),
    });
  }

  public sendTyping(conversationId: string, isTyping: boolean): boolean {
    return this.sendData('typing', {
      conversationId,
      userId: this.myUid,
      isTyping,
      timestamp: Date.now(),
    });
  }

  public sendReaction(messageId: string, emoji: string, action: 'add' | 'remove'): boolean {
    return this.sendData('reaction', {
      messageId,
      userId: this.myUid,
      emoji,
      action,
    });
  }

  public sendEdit(messageId: string, content: string): boolean {
    return this.sendData('edit', {
      messageId,
      content,
      editedAt: Date.now(),
    });
  }

  public sendDelete(messageId: string): boolean {
    return this.sendData('delete', {
      messageId,
    });
  }

  public close(): void {
    this.pendingIceCandidates = [];
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    this.setState('closed');
  }

  private setState(state: PeerConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.callbacks.onStateChange(state);
    }
  }

  public isDirectReady(): boolean {
    return this.dataChannel?.readyState === 'open';
  }
}
