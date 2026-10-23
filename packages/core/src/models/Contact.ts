export type PresenceStatus = 'online' | 'offline' | 'away' | 'busy';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: 'linux' | 'windows' | 'macos' | 'android' | 'ios' | 'web';
  appVersion: string;
}

export interface Contact {
  uid: string;
  username: string;
  avatarUrl?: string;
  ipAddress: string;
  port: number;
  status: PresenceStatus;
  lastSeen: number;
  deviceInfo: DeviceInfo;
  isPaired: boolean;
  pairingToken?: string;
  publicKey?: string;
}

export interface PairingRequest {
  pairingToken: string;
  requesterUid: string;
  requesterUsername: string;
  requesterIp: string;
  requesterPort: number;
  deviceInfo: DeviceInfo;
  timestamp: number;
  expiresAt: number;
}
