# LYNQ Communication Security & Privacy Model

## 1. Security Architecture & Local-First Trust Model

LYNQ Communication is architected strictly from the ground up as a **local-first, peer-to-peer communication system**. 
Unlike centralized cloud messengers, LYNQ:
- Never sends messages, media, files, telemetry, contact lists, or cryptographic keys to external servers or third-party cloud services.
- Operates reliably on isolated Local Area Networks (LAN), ad-hoc Wi-Fi networks, and offline environments without Internet connectivity.
- Persists all conversation histories and received file metadata exclusively in local SQLite databases protected with WAL journaling on each user's device.

---

## 2. Threat Model & Boundaries

| Surface | Threat Vector | Mitigation in LYNQ |
| :--- | :--- | :--- |
| **Signaling Identity Spoofing** | Rogue client forging `senderId` in envelopes to impersonate peers | WebSocket sessions are strictly bound to authenticated `uid` upon registration. Any envelope with mismatched `senderId !== ws.clientUid` is immediately dropped and rejected with `IDENTITY_SPOOFING_REJECTED`. |
| **Local Discovery** | Rogue peer announcement via UDP broadcast / mDNS | Nodes must be explicitly paired using short-lived tokens or QR codes before mutual trusted communication is granted. |
| **Pairing Brute Force** | Rapid automated guessing of 6-character pairing tokens | Sliding-window `RateLimiter` enforces lockout after 5 consecutive failed attempts with a 15-minute cooldown. |
| **Signaling Server** | Socket flooding / Buffer exhaustion / DoS attacks | Envelopes are bounded; rate limiter throttles traffic to 200 messages/sec per authenticated client UID. |
| **File Transfers (up to 20 GB)** | Malicious file payload injection, Directory traversal | Strict filename sanitization (`sanitizeFilename`) strips `../`, control codes, and Windows drive/UNC prefixes. Explicit user acceptance is mandatory prior to chunk streaming. |
| **File Tampering** | Corrupted or substituted payload chunks in transit | End-to-end cryptographic SHA-256 verification of the assembled payload; immediate abort and rejection if hash mismatch occurs. |
| **Media Eavesdropping** | Silent recording or background microphone/camera usage | Real-time media devices (Microphone, Camera) are acquired only upon explicit user acceptance and hardware tracks are stopped immediately upon call termination. |
| **Data Integrity** | Reconnection packet duplication or out-of-order replay | Message IDs are generated using UUIDv4; database persistence enforces `ON CONFLICT(id) DO UPDATE` to ensure idempotent writes. |

---

## 3. Cryptographic Primitives & Transport Security

1. **WebRTC DataChannels & Real-Time Media (Voice/Video)**:
   - Transport Layer Security is guaranteed via standard **DTLS 1.2 / 1.3** (Datagram Transport Layer Security) and **SRTP** (Secure Real-time Transport Protocol).
   - Peer connection keys are ephemeral and negotiated directly between endpoints using Diffie-Hellman key exchange.

2. **File Integrity**:
   - SHA-256 content hashes are calculated using Web Crypto API (`crypto.subtle.digest`) with fallback to native node crypto.

3. **Pairing Tokens**:
   - Tokens use high-entropy random character selection from an unambiguous 32-character alphabet (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) with a default 10-minute time-to-live (TTL).

---

## 4. Safe File Handling Policy

- **No Automatic Execution**: LYNQ will never execute, run, or open received binaries, scripts, or archives automatically.
- **Explicit Consent**: Incoming file transfer requests require user confirmation (Accept or Reject) in the UI before any chunk data is accepted or written to storage.
- **Configurable Storage Location**: Files are saved into designated user download directories, preventing unauthorized filesystem modifications.

---

## 5. Reporting Security Vulnerabilities

We take security issues seriously. If you discover a security vulnerability in LYNQ Communication, please report it responsibly:
- Do not open a public issue on GitHub.
- Submit a detailed report to the security team or maintainers with reproduction steps and proof-of-concept information.
- We will acknowledge receipt within 48 hours and work with you on a responsible disclosure timeline.
