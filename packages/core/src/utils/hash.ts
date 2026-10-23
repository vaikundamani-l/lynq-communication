/**
 * Computes SHA-256 hash of an ArrayBuffer or Uint8Array
 */
export async function computeSHA256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8 as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Node.js fallback
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(uint8).digest('hex');
  } catch (err) {
    throw new Error('SHA-256 crypto implementation unavailable: ' + String(err));
  }
}

/**
 * Validates that an incoming file hash matches expected hash
 */
export async function verifyFileIntegrity(
  data: ArrayBuffer | Uint8Array,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await computeSHA256(data);
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}
