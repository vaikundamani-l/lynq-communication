# Contributing to LYNQ Communication

Thank you for your interest in contributing to **LYNQ Communication**! We welcome community contributions, bug reports, performance enhancements, and feature suggestions.

---

## 🛠️ Development Workflow

LYNQ is managed as an npm monorepo using npm workspaces across 5 modular packages:
- `@lynq/core`: Protocol types, envelopes, hashing, rate limiting, and domain models.
- `@lynq/storage`: SQLite repositories using `better-sqlite3` in WAL mode.
- `@lynq/network-service`: mDNS and UDP discovery, WebSocket signaling server, pairing manager, and daemon.
- `@lynq/p2p-engine`: WebRTC DataChannels, file chunking/streaming engine, and voice/video call session engine.
- `@lynq/web-ui`: React 18, TypeScript, and Vite frontend.

### Prerequisites
- Node.js >= 20 LTS (Node 22 recommended)
- npm >= 10
- Git
- For building native Tauri packages: Rust toolchain (Rust >= 1.70) and OS-specific webview libraries (`libwebkit2gtk-4.1-dev` on Linux).

### Setting Up Local Environment
```bash
# Clone the repository
git clone https://github.com/lynq/lynq-communication.git
cd lynq-communication

# Install all workspace dependencies
npm install

# Run automated test suites across all packages
npm test

# Build all packages
npm run build
```

---

## 🧪 Testing Guidelines

Before opening a pull request, verify that all test suites pass without errors:
```bash
npm test
```

When contributing new features:
1. Write unit tests for new domain models, persistence repositories, or protocol messages.
2. If changing networking or streaming engines, run the benchmark test suite (`packages/p2p-engine/tests/benchmark.test.ts`) to ensure no performance regression.
3. Keep external dependencies to a minimum; do not add heavy external libraries without prior discussion.

---

## 🔒 Security & Code Standards

- **Preserve Separation of Concerns**: Keep networking, messaging, media sharing, storage, and UI strictly separated in their designated packages.
- **No Hard-Coded Credentials or Secrets**: All tokens, message IDs, and temporary files must be generated dynamically.
- **Safe File Handling**: Always sanitize filenames using `sanitizeFilename` and reject unsafe path traversals.
- **Explicit Consent**: Real-time media (mic/camera) and incoming file transfers must require user confirmation.
- **Documentation**: Update code docstrings, `README.md`, or `SECURITY.md` when adding or modifying core behaviors.

---

## 📋 Pull Request Process

1. Fork the repository and create your feature branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Commit your changes with descriptive commit messages following the Conventional Commits specification (e.g. `feat(p2p): ...`, `fix(storage): ...`, `docs: ...`).
3. Ensure `npm test` and `npm run build` pass with zero failures.
4. Submit your pull request to the `main` branch.
5. Address any feedback or automated CI checks promptly.

Thank you for helping make local-first, private communication accessible to everyone!
