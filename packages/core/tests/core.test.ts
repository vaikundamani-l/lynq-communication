import { describe, it, expect } from 'vitest';
import {
  generateUUID,
  generatePairingToken,
  computeSHA256,
  verifyFileIntegrity,
  sanitizeFilename,
  validateMessageContent,
  Message,
  Contact,
  SignalingEnvelope,
} from '../src/index.js';

describe('@lynq/core utilities', () => {
  it('generates valid non-empty UUIDs', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
  });

  it('generates 6-character pairing tokens', () => {
    const token = generatePairingToken();
    expect(token).toHaveLength(6);
    expect(token).toMatch(/^[A-Z0-9]+$/);
  });

  it('computes correct SHA-256 hash and verifies integrity', async () => {
    const sampleText = 'LYNQ-communication-test-data';
    const data = new TextEncoder().encode(sampleText);
    const hash = await computeSHA256(data);

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64); // 256 bits = 64 hex chars

    const isValid = await verifyFileIntegrity(data, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyFileIntegrity(new TextEncoder().encode('other'), hash);
    expect(isInvalid).toBe(false);
  });

  it('sanitizes unsafe filenames and directory traversal attempts', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFilename('normal_photo.png')).toBe('normal_photo.png');
    expect(sanitizeFilename('bad:name*with?chars.pdf')).toBe('bad_name_with_chars.pdf');
    expect(sanitizeFilename('')).toBe('unnamed_file');
    expect(sanitizeFilename('   ')).toBe('unnamed_file');
  });

  it('validates message content correctly', () => {
    expect(validateMessageContent('Hello LYNQ!').valid).toBe(true);
    expect(validateMessageContent('').valid).toBe(false);
    expect(validateMessageContent('   ').valid).toBe(false);

    // Large content test
    const oversized = 'a'.repeat(70000);
    expect(validateMessageContent(oversized).valid).toBe(false);
  });

  it('supports constructing typed message and signaling envelope', () => {
    const msg: Message = {
      id: generateUUID(),
      senderId: 'user-alice',
      receiverId: 'user-bob',
      conversationId: 'conv-123',
      conversationType: 'direct',
      type: 'text',
      content: 'Hello Bob!',
      timestamp: Date.now(),
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    const envelope: SignalingEnvelope<Message> = {
      id: generateUUID(),
      type: 'msg:send',
      senderId: msg.senderId,
      recipientId: msg.receiverId,
      timestamp: Date.now(),
      payload: msg,
    };

    expect(envelope.type).toBe('msg:send');
    expect(envelope.payload.content).toBe('Hello Bob!');
  });
});
