export type ImageDimensions = { width: number; height: number };

const ascii = (bytes: Uint8Array, start: number, length: number) => Array.from(bytes.slice(start, start + length))
  .map((byte) => String.fromCharCode(byte))
  .join('');

const valid = (width: number, height: number): ImageDimensions | null => {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width <= 0 || height <= 0 || width > 100_000 || height > 100_000) return null;
  return { width, height };
};

const jpegDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) break;

    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) break;
    if (sofMarkers.has(marker) && length >= 7) {
      const height = view.getUint16(offset + 3, false);
      const width = view.getUint16(offset + 5, false);
      return valid(width, height);
    }
    offset += length;
  }
  return null;
};

const webpDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 4);

  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return valid(width, height);
  }

  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + b0 + ((b1 & 0x3f) << 8);
    const height = 1 + ((b1 & 0xc0) >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10);
    return valid(width, height);
  }

  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return valid(width, height);
  }

  return null;
};

const avifDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 4; i + 12 <= bytes.length; i += 1) {
    if (ascii(bytes, i, 4) !== 'ispe') continue;
    const width = view.getUint32(i + 4, false);
    const height = view.getUint32(i + 8, false);
    const dimensions = valid(width, height);
    if (dimensions) return dimensions;
  }
  return null;
};

export const readImageDimensions = (buffer: ArrayBuffer, mime: string): ImageDimensions | null => {
  const bytes = new Uint8Array(buffer);
  const normalized = mime.split(';')[0].trim().toLowerCase();
  const view = new DataView(buffer);

  if (normalized === 'image/png' && bytes.length >= 24) {
    return valid(view.getUint32(16, false), view.getUint32(20, false));
  }
  if (normalized === 'image/gif' && bytes.length >= 10) {
    return valid(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (normalized === 'image/jpeg') return jpegDimensions(bytes);
  if (normalized === 'image/webp') return webpDimensions(bytes);
  if (normalized === 'image/avif') return avifDimensions(bytes);
  return null;
};
