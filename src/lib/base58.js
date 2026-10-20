// Minimal, dependency-free base58 (Bitcoin/Solana alphabet).
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) MAP[ALPHABET.charCodeAt(i)] = i;

export function decodeBase58(str) {
  if (typeof str !== 'string') throw new TypeError('base58: expected string');
  if (str.length === 0) return new Uint8Array(0);
  // Count leading '1's → leading zero bytes.
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const size = Math.ceil(((str.length - zeros) * 733) / 1000) + 1; // log(58)/log(256)
  const b256 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const carryIn = c < 128 ? MAP[c] : -1;
    if (carryIn === -1) throw new Error(`base58: invalid character '${str[i]}'`);
    let carry = carryIn;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry & 0xff;
      carry >>= 8;
    }
    length = j;
  }
  let i = size - length;
  while (i < size && b256[i] === 0) i++;
  const out = new Uint8Array(zeros + (size - i));
  out.set(b256.subarray(i), zeros);
  return out;
}

export function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = Uint8Array.from(bytes);
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil(((bytes.length - zeros) * 138) / 100) + 1; // log(256)/log(58)
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let i = size - length;
  while (i < size && b58[i] === 0) i++;
  let out = '1'.repeat(zeros);
  for (; i < size; i++) out += ALPHABET[b58[i]];
  return out;
}

export function isBase58Address(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 128 || MAP[c] === -1) return false;
  }
  try {
    return decodeBase58(s).length === 32;
  } catch {
    return false;
  }
}

export function isBase58Signature(s) {
  if (typeof s !== 'string' || s.length < 86 || s.length > 90) return false;
  try {
    return decodeBase58(s).length === 64;
  } catch {
    return false;
  }
}

// Little-endian unsigned integer readers over Uint8Array (for Anchor args).
export function readU64LE(bytes, offset) {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[offset + i]);
  return v;
}
export function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
