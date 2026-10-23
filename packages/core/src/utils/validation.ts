/**
 * Sanitizes a filename to protect against directory traversal, null bytes,
 * and dangerous filesystem characters.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'unnamed_file';
  }

  // Remove any leading path components (e.g. /etc/passwd or C:\Windows\..)
  let clean = rawName.replace(/^.*[\\\/]/, '');

  // Strip null bytes and control chars
  clean = clean.replace(/[\x00-\x1f\x7f]/g, '');

  // Strip dangerous path traversal tokens
  clean = clean.replace(/\.{2,}/g, '.');

  // Replace invalid filesystem characters with underscores
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');

  // Trim whitespace and dots
  clean = clean.trim().replace(/^\.+|\.+$/g, '');

  if (!clean || clean.length === 0) {
    return 'unnamed_file';
  }

  // Limit max length to 255 chars
  return clean.slice(0, 255);
}

/**
 * Validates text message input: non-empty, within size bounds (e.g., 64KB)
 */
export function validateMessageContent(content: string, maxBytes = 65536): { valid: boolean; error?: string } {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }
  if (content.trim().length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }
  const byteLength = new TextEncoder().encode(content).length;
  if (byteLength > maxBytes) {
    return { valid: false, error: `Message exceeds size limit of ${maxBytes} bytes` };
  }
  return { valid: true };
}
