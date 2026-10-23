# LYNQ Communication

[![CI](https://github.com/lynq/lynq-communication/actions/workflows/ci.yml/badge.svg)](https://github.com/lynq/lynq-communication/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**LYNQ Communication** is an open-source, local-first communication and media transfer platform inspired by modern messaging apps (WhatsApp, Telegram). Designed for ultra-fast direct communication over local area networks (LAN / Wi-Fi) with zero cloud reliance.

---

## ⚡ Highlights

- 💬 **Complete Messaging**: 1-to-1 conversations, group chats, message editing, deletion, replies, forward, emoji reactions, and full-text search.
- ⚡ **Local-First & Ultra-Fast**: Operates seamlessly without internet access. Data travels directly across your local network.
- 📁 **High-Speed P2P Media Sharing**: Direct peer-to-peer file transfer with chunking, backpressure, progress tracking, and SHA-256 integrity verification.
- 🔍 **Zero-Config Discovery**: Automatic mDNS (`_lynq._tcp.local`) and UDP broadcast discovery, plus QR-code pairing.
- 📞 **Voice & Video Calling**: Real-time peer-to-peer calling powered by WebRTC.
- 🛡️ **Privacy & Security**: Authenticated pairing, explicit file transfer approval, safe path sanitization, and strictly local SQLite persistence.

---

## 🏗️ Architecture

```
lynq-communication/
├── packages/
│   ├── core/                  # Canonical data models, protocol schemas, security utils
│   ├── storage/               # SQLite database with WAL mode and repository layer
│   ├── network-service/       # mDNS/UDP discovery, QR pairing, WebSocket signaling
│   ├── p2p-engine/            # WebRTC DataChannels and media streaming
│   └── web-ui/                # Modern React 18 + TypeScript + Vite UI
├── src-tauri/                 # Tauri desktop shell
├── docs/                      # Technical specifications and guides
└── tests/                     # Automated unit and integration test suites
```

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js >= 20 (Node 22 recommended)
- npm >= 10

### Setup & Run Tests
```bash
# Clone the repository
git clone https://github.com/lynq/lynq-communication.git
cd lynq-communication

# Install dependencies across all packages
npm install

# Run test suites
npm test

# Build all packages
npm run build
```

---

## 📜 License
MIT License.
