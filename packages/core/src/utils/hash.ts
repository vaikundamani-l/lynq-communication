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

/**
 * Computes a fast, progressive file fingerprint for multi-gigabyte files (up to 20 GB)
 * without needing to load the entire file into memory.
 */
export async function computeStreamFingerprint(
  fileSize: number,
  readSlice: (start: number, end: number) => Promise<Uint8Array>
): Promise<string> {
  // If <= 10MB, read whole file and compute exact SHA-256
  if (fileSize <= 10 * 1024 * 1024) {
    const full = await readSlice(0, fileSize);
    return computeSHA256(full);
  }

  // For multi-GB files: Sample head (1MB), middle (1MB), tail (1MB) + fileSize metadata
  const sampleSize = 1024 * 1024;
  const head = await readSlice(0, sampleSize);
  const midStart = Math.floor(fileSize / 2) - Math.floor(sampleSize / 2);
  const mid = await readSlice(midStart, midStart + sampleSize);
  const tailStart = Math.max(0, fileSize - sampleSize);
  const tail = await readSlice(tailStart, fileSize);

  const totalLen = head.length + mid.length + tail.length + 8;
  const combined = new Uint8Array(totalLen);
  combined.set(head, 0);
  combined.set(mid, head.length);
  combined.set(tail, head.length + mid.length);

  const view = new DataView(combined.buffer, combined.byteOffset + head.length + mid.length + tail.length, 8);
  view.setBigUint64(0, BigInt(fileSize));

  return computeSHA256(combined);
}
