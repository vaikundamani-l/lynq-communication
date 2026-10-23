# LYNQ Communication Architecture Specification

## 1. Overview
LYNQ Communication is an open-source, local-first communication and media transfer platform built for ultra-fast direct communication over local networks (LAN / Wi-Fi) with no cloud dependency.

## 2. Monorepo Modules & Responsibilities

```
lynq-communication/
├── packages/
│   ├── core/                  # Canonical TypeScript models, wire protocol schemas, crypto & security
│   ├── storage/               # SQLite local persistence with WAL mode, migrations, and repositories
│   ├── network-service/       # mDNS & UDP discovery, QR pairing, WebSocket signaling engine
│   ├── p2p-engine/            # WebRTC DataChannel (files, messages) & MediaStream (voice/video calls)
│   └── web-ui/                # React 18 + Vite desktop/mobile UI
├── src-tauri/                 # Tauri desktop shell configuration and native host bridge
├── docs/                      # Architectural specs, security threat model, and API reference
└── .github/workflows/         # Automated test and release packaging workflows
```

### Module Separation
1. **`@lynq/core`**:
   - Zero-dependency core contract.
   - Message, Contact, Group, FileTransfer, CallSession domain models.
   - Wire protocol serialization envelopes (`SignalingEnvelope`).
   - SHA-256 integrity verification, safe filename sanitization (directory traversal protection), UUID and pairing token generators.

2. **`@lynq/storage`**:
   - Persistent embedded SQLite engine (`better-sqlite3` with Write-Ahead Logging `WAL` mode for high-throughput concurrent I/O).
   - Versioned migrations (`schema_migrations`).
   - Repositories:
     - `MessageRepository`: Idempotent upserting (preventing duplicates on reconnection), conversation history, full-text message search, reactions, soft delete, unread counters.
     - `ContactRepository`: Discovered and paired peers, presence status, device metadata.
     - `GroupRepository`: Local group creation, member roles (creator, admin, member), pinned messages.
     - `SettingsRepository`: Local user configuration and preferences.

3. **`@lynq/network-service`**:
   - Zero-configuration local discovery using mDNS (`_lynq._tcp.local`) and UDP broadcast fallback.
   - Short-lived pairing tokens and QR code payload handshake.
   - WebSocket signaling server routing SDP offers/answers, ICE candidates, and instant messages.

4. **`@lynq/p2p-engine`** (Phase 3 & 5):
   - Direct WebRTC DataChannel streaming with backpressure (64KB chunks).
   - Real-time voice and video media tracks.

5. **`@lynq/web-ui`** (Phase 2 & 10):
   - React + TypeScript + Vite modern messaging interface.
   - Responsive design for desktop and mobile screen sizes.

## 3. Data Flow

```
[Peer A (Frontend)] 
      │ 
      ▼
[P2P Engine / Network Service] 
      │ 
      ├───────────► [Local Network Service] ──(mDNS / UDP)──► [Local Network Discovery]
      │                                                                  │
      ├───────────► [WebSocket Signaling] ──(SDP / ICE)───────────────► [Peer B]
      │                                                                  │
      └───────────► [WebRTC DataChannel] ──(Direct Messages & Files)───► [Peer B]
      │
      ▼
[Local SQLite Storage] (Encrypted/Protected Local Store)
```

## 4. Security & Privacy Model
- **No Cloud Dependency**: All discovery, signaling, messaging, and file transfers stay strictly on the local network.
- **Pairing Authentication**: Unpaired peers must be approved or scan a short-lived QR token before receiving incoming transfers.
- **Safe File Handling**: Incoming files require explicit acceptance, sanitize file names against directory traversal, and verify SHA-256 checksums before saving.
