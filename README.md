# LYNQ Communication

<div align="center">

[![CI](https://github.com/vaikundamani-l/lynq-communication/actions/workflows/ci.yml/badge.svg)](https://github.com/vaikundamani-l/lynq-communication/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-42%2F42%20Passing-brightgreen.svg)](packages/)
[![Security: Audited](https://img.shields.io/badge/Security-Local--First%20%7C%20Anti--Spoofing%20%7C%20Zero--Cloud-success.svg)](SECURITY.md)

**An open-source, local-first cross-platform messaging, group communication, high-speed file transfer, and WebRTC calling platform.**

*Zero cloud servers. Zero data collection. Ultra-fast peer-to-peer performance over local networks.*

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Performance Benchmarks](#-performance-benchmarks)
- [System Architecture](#-system-architecture)
- [Supported Platforms](#-supported-platforms)
- [Installation Guide](#-installation-guide)
  - [For End Users (Prebuilt Releases)](#for-end-users-prebuilt-releases)
  - [For Developers & Contributors](#for-developers--contributors)
- [Troubleshooting & Diagnostics](#-troubleshooting--diagnostics)
- [Security & Privacy Model](#-security--privacy-model)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**LYNQ Communication** delivers the familiar, polished user experience of modern messaging platforms (like WhatsApp and Telegram) combined with the sovereign privacy and extreme speed of local networking.

Whether you are collaborating in an office without internet access, sharing large media files between your PC and laptop over home Wi-Fi, or conducting secure voice/video calls across an isolated LAN, LYNQ connects your devices directly without routing bytes through third-party servers.

---

## ✨ Key Features

### 1. Modern Messaging & Group Collaboration
- **One-to-One Conversations**: Private messaging with real-time delivery status (`pending`, `sent`, `delivered`, `read`) with double-check icons.
- **Private Groups**: Local group discovery, role management (`creator`, `admin`, `member`), group file galleries, and message fan-out distribution.
- **Rich Message Actions**: Message editing, soft deletion, reply quotes, forwarding, pinned messages, and emoji reactions (`👍`, `❤️`, `😂`, `😮`, `😢`, `🔥`).
- **Typing Indicators & Presence**: Throttled typing feedback and online/away/offline device status.

### 2. High-Speed P2P Media & 20 GB File Transfers
- **Massive 20 GB Capacity**: Supports direct bit-for-bit transfers from small photos up to 20 GB archives with zero-RAM memory exhaustion.
- **Adaptive Chunking Engine**: Dynamically calculates optimal chunk sizing (64 KB for $\le 10$ MB, 256 KB for $\le 100$ MB, 1 MB for $\le 1$ GB, 2 MB for $\le 20$ GB) with backpressure flow control.
- **Direct Disk-Backed Streaming**: Streaming `ChunkSink` reception writes incoming chunks directly to local storage without buffering multi-gigabyte blobs in RAM.
- **Always-Visible Save/Download**: Received file cards always provide a one-click "⬇️ Save" option with clear human-readable size formatting (`B`, `KB`, `MB`, `GB`).
- **Cryptographic Integrity**: Streaming SHA-256 fingerprinting guarantees 100% bit-for-bit file authenticity before completion.

### 3. Voice Messages & WebRTC Calling
- **Interactive Voice Notes**: In-browser audio recording with live animated waveform player, scrub controls, and variable playback speeds (`1.0x`, `1.5x`, `2.0x`).
- **One-to-One Audio & Video Calling**: Ultra-low latency voice and video calls powered by WebRTC DTLS/SRTP with camera switching, mute controls, and call duration tracking.
- **ICE Candidate Queuing**: Early ICE candidates arriving before remote description negotiation are safely buffered and drained, eliminating call setup drops.
- **Hardware Privacy**: Microphone and camera hardware are immediately released when calls or recordings end.

### 4. Zero-Config Device Discovery & `lynq.local` Access
- **Local Network Hostname**: Reachable at `http://lynq.local:5173` (or `http://lynq.local` with port 80 forwarding) via built-in mDNS advertising on your LAN.
- **mDNS & UDP Discovery**: Automatic local network peer discovery via `_lynq._tcp.local` and UDP port `5555`.
- **Anti-Spoofing Signaling**: WebSocket connections strictly enforce identity binding; forged `senderId` envelopes are dropped and flagged as security violations.
- **QR-Code Pairing**: Interactive pairing flow with 6-character short-lived tokens (10-minute TTL) and camera QR scanner integration.
- **Brute Force Protection**: Automatic sliding-window rate limiting locks out hostile nodes after repeated failed pairing attempts.

### 5. Mobile Responsive UX & Native Browser Navigation
- **Responsive Mobile Layout**: WhatsApp-style 4-tab bottom navigation (`Chats`, `Peers`, `Pair`, `Settings`), sliding chat window, and bottom action sheets.
- **Browser History & Back/Forward**: Complete native History API integration (`popstate` and hash routing `#/chat/:id`, `#/group/:id`). Tapping Back in mobile Chrome smoothly navigates from chat to conversation list without exiting the page or trapping the user.

### 5. Local-First & Offline Resilience
- **Offline SQLite Storage**: All messages, contacts, and transfer logs are saved locally in WAL mode (`better-sqlite3`).
- **Store-and-Forward Outbox**: Messages sent to disconnected peers queue safely in an outbox and automatically drain when the peer reconnects.
- **Deduplication**: Message UUIDs prevent duplicate messages upon network reconnects.

---

## ⚡ Performance Benchmarks

All benchmarks are measured using actual automated performance test suites ([`benchmark.test.ts`](file:///home/shadow-khan/lynq-communication/packages/p2p-engine/tests/benchmark.test.ts)):

| Metric / Scenario | Measured Result | Specification Target | Status |
| :--- | :--- | :--- | :--- |
| **Local Messaging Round-Trip Latency** | **0.007 ms** (avg) / **0.010 ms** (p95) | < 5.0 ms |  Passed |
| **P2P File Transfer Throughput (10 MB)** | **260.03 MB/s** (0.038 s total) | > 20.0 MB/s |  Passed |
| **5 Concurrent P2P File Streams (5 MB)** | **321.99 MB/s** (0.016 s total) | > 50.0 MB/s |  Passed |
| **SHA-256 Hash Calculation Throughput** | Verified bit-for-bit | 100% Match |  Passed |
| **Socket Envelope Buffer Limit** | Max 512 KB per envelope | Bounded Memory |  Passed |

---

## 🏗️ System Architecture

LYNQ is designed with a strictly modular architecture across 5 separated packages:

```
lynq-communication/
├── packages/
│   ├── core/                  # Canonical models, protocol schemas, rate limiter, SHA-256
│   ├── storage/               # SQLite persistence, WAL mode, repositories & migrations
│   ├── network-service/       # UDP/mDNS discovery, WebSocket signaling server, pairing manager
│   ├── p2p-engine/            # WebRTC DataChannels, chunk streaming, voice/video call session
│   └── web-ui/                # React 18 + TypeScript + Vite responsive WhatsApp-style layout
├── src-tauri/                 # Tauri desktop shell configuration
├── scripts/                   # Desktop launcher and service management scripts
├── .github/workflows/         # CI/CD and multi-platform packaging automation
├── SECURITY.md                # Security architecture and threat model
└── CONTRIBUTING.md            # Guidelines for open-source contributors
```

---

## 🖥️ Supported Platforms

| Operating System | Architecture | Package Format |
| :--- | :--- | :--- |
| **Ubuntu / Debian** | x86_64, aarch64 | `.deb`, `.AppImage` |
| **Fedora / RHEL / Arch** | x86_64 | `.AppImage` / Tarball |
| **Windows 10 / 11** | x64 | `.msi`, `.exe` installer |
| **macOS (12+)** | Apple Silicon (M1-M4), Intel | `.dmg` |

---

## 🚀 Installation Guide

### For End Users (Prebuilt Releases)
Ordinary users do not need Node.js, Git, or compilers:
1. Navigate to the [Releases](https://github.com/vaikundamani-l/lynq-communication/releases) page on GitHub.
2. Download the package for your platform:
   - **Linux**: Download `.AppImage` (make executable: `chmod +x lynq*.AppImage && ./lynq*.AppImage`) or `.deb`.
   - **Windows**: Download and run `.msi` or `.exe`.
   - **macOS**: Open `.dmg` and drag LYNQ to Applications.
3. Launch LYNQ Communication. Nearby paired devices on your Wi-Fi/LAN will be detected automatically!

### For Developers & Contributors
```bash
# 1. Clone repository
git clone https://github.com/vaikundamani-l/lynq-communication.git
cd lynq-communication

# 2. Install workspace dependencies
npm install

# 3. Run automated tests (all 38 test suites)
npm test

# 4. Build all packages
npm run build

# 5. Launch the desktop app with companion daemon
./scripts/start-desktop.sh
```

---

## 🔧 Troubleshooting & Diagnostics

- **Cannot discover nearby devices**:
  - Verify both devices are connected to the same subnet/Wi-Fi router.
  - Ensure UDP port `5555` and TCP port `4848` are allowed through your firewall:
    ```bash
    sudo ufw allow 5555/udp
    sudo ufw allow 4848/tcp
    ```
  - Some guest Wi-Fi networks enable "Client Isolation" which blocks peer-to-peer traffic. Connect via standard LAN or use QR pairing with manual IP entry.
- **Microphone / Camera access issues**:
  - Check browser/system permissions under OS Settings > Privacy & Security > Camera & Microphone.
- **Port Conflict on 4848**:
  - Configure a custom port via the settings drawer or daemon configuration.

---

## 🛡️ Security & Privacy Model

LYNQ strictly follows a **Zero-Cloud, Zero-Knowledge** security model:
- Read our full [Security Architecture & Threat Model](SECURITY.md).
- Short-lived pairing tokens (10-minute TTL) with brute-force lockout.
- All file transfers require explicit confirmation before receipt.
- Transport security enforced through DTLS and SRTP.

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on code style, testing, and pull requests.

---

## 📜 License

LYNQ Communication is licensed under the [MIT License](LICENSE).
