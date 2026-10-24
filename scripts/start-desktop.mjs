import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('==========================================');
console.log('⚡ Starting LYNQ Communication Desktop...');
console.log('==========================================');

// 1. Build workspace packages if dist is missing
if (!fs.existsSync(path.join(rootDir, 'packages', 'core', 'dist'))) {
  console.log('📦 Compiling backend modules...');
  const build = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  await new Promise((resolve, reject) => {
    build.on('close', (code) => (code === 0 ? resolve(null) : reject(new Error('Build failed'))));
  });
}

// 2. Start the local networking daemon
console.log('🌐 Launching local networking daemon...');
const daemonCode = `
import('./packages/network-service/dist/index.js').then(async ({ LynqDaemon }) => {
  const daemon = new LynqDaemon();
  await daemon.start();
  console.log('✅ LYNQ Daemon active on signaling port ' + daemon.profile.signalingPort);
  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });
});
`;

const daemonProc = spawn(process.execPath, ['-e', daemonCode], {
  cwd: rootDir,
  stdio: 'inherit',
});

// 3. Start Vite frontend dev server
console.log('🖥️ Starting UI shell on http://localhost:5173...');
const uiProc = spawn(
  /^win/.test(process.platform) ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--prefix', 'packages/web-ui'],
  {
    cwd: rootDir,
    stdio: 'inherit',
  }
);

function cleanup() {
  console.log('\n🛑 Stopping LYNQ Communication...');
  try {
    daemonProc.kill('SIGINT');
  } catch {}
  try {
    uiProc.kill('SIGINT');
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
