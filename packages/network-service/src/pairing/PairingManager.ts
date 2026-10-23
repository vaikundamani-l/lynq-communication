import { EventEmitter } from 'node:events';
import { generatePairingToken, PairingRequest, Contact, DeviceInfo } from '@lynq/core';
import { ContactRepository } from '@lynq/storage';

export interface ActivePairingSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

export class PairingManager extends EventEmitter {
  private activeToken: ActivePairingSession | null = null;
  private readonly tokenTtlMs = 10 * 60 * 1000; // 10 minutes

  constructor(
    private myUid: string,
    private myUsername: string,
    private myIp: string,
    private myPort: number,
    private myDeviceInfo: DeviceInfo,
    private contactRepo: ContactRepository
  ) {
    super();
  }

  /**
   * Generate a new pairing invitation with a short token and QR payload
   */
  public createPairingInvitation(): { token: string; qrPayload: string; expiresAt: number } {
    const token = generatePairingToken(6);
    const now = Date.now();
    const expiresAt = now + this.tokenTtlMs;

    this.activeToken = { token, createdAt: now, expiresAt };

    const payloadObj = {
      protocol: 'LYNQ_PAIR_V1',
      token,
      uid: this.myUid,
      username: this.myUsername,
      ip: this.myIp,
      port: this.myPort,
      deviceInfo: this.myDeviceInfo,
      expiresAt,
    };

    return {
      token,
      qrPayload: JSON.stringify(payloadObj),
      expiresAt,
    };
  }

  /**
   * Verify an incoming pairing request with a presented token
   */
  public verifyPairingRequest(request: PairingRequest): { approved: boolean; error?: string } {
    if (!this.activeToken) {
      return { approved: false, error: 'No active pairing session on this host' };
    }

    if (Date.now() > this.activeToken.expiresAt) {
      this.activeToken = null;
      return { approved: false, error: 'Pairing token has expired' };
    }

    if (request.pairingToken !== this.activeToken.token) {
      return { approved: false, error: 'Invalid pairing token' };
    }

    // Successfully verified! Save contact as paired
    const contact: Contact = {
      uid: request.requesterUid,
      username: request.requesterUsername,
      ipAddress: request.requesterIp,
      port: request.requesterPort,
      status: 'online',
      lastSeen: Date.now(),
      deviceInfo: request.deviceInfo,
      isPaired: true,
      pairingToken: request.pairingToken,
    };

    this.contactRepo.upsertContact(contact);
    this.contactRepo.setPairingStatus(request.requesterUid, true);

    this.emit('peerPaired', contact);
    return { approved: true };
  }

  public getActiveToken(): ActivePairingSession | null {
    if (this.activeToken && Date.now() > this.activeToken.expiresAt) {
      this.activeToken = null;
    }
    return this.activeToken;
  }

  public revokePairing(peerUid: string): void {
    this.contactRepo.setPairingStatus(peerUid, false);
    this.emit('pairingRevoked', peerUid);
  }
}
