// Program Derived Address derivation without @solana/web3.js.
// Needs: sha256 (WebCrypto) and an ed25519 "is point on curve" check (BigInt math).
import { decodeBase58, encodeBase58 } from './base58.js';

const P = (1n << 255n) - 19n;
// d = -121665 / 121666 mod p
const D = mod(-121665n * modInverse(121666n));

function mod(a) {
  const r = a % P;
  return r < 0n ? r + P : r;
}
function modPow(base, exp) {
  let result = 1n;
  base = mod(base);
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % P;
    base = (base * base) % P;
    exp >>= 1n;
  }
  return result;
}
function modInverse(a) {
  return modPow(a, P - 2n);
}

/**
 * Returns true if the 32-byte compressed ed25519 point is a valid curve point.
 * Mirrors curve25519-dalek decompression used by Solana's PublicKey::is_on_curve.
 */
export function isOnCurve(bytes) {
  if (bytes.length !== 32) return false;
  const sign = bytes[31] >> 7;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  // x^2 = u / v
  const x2 = mod(u * modInverse(v));
  if (x2 === 0n) {
    // x == 0 → sign bit must be 0
    return sign === 0;
  }
  // Euler's criterion: x2 is a quadratic residue iff x2^((p-1)/2) == 1
  // (need to also allow sqrt via the sqrt(-1) trick; Euler's criterion covers it.)
  return modPow(x2, (P - 1n) / 2n) === 1n;
}

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toBytes(seed) {
  if (seed instanceof Uint8Array) return seed;
  if (typeof seed === 'string') return new TextEncoder().encode(seed);
  if (Array.isArray(seed)) return Uint8Array.from(seed);
  throw new TypeError('seed must be Uint8Array | string | number[]');
}

/** createProgramAddress(seeds, programId) → base58 address or null if the hash lands on the curve. */
export async function createProgramAddress(seeds, programId) {
  const programBytes = decodeBase58(programId);
  const parts = seeds.map(toBytes);
  for (const s of parts) if (s.length > 32) throw new Error('max seed length exceeded');
  const hash = await sha256(concat([...parts, programBytes, PDA_MARKER]));
  if (isOnCurve(hash)) return null;
  return encodeBase58(hash);
}

/** findProgramAddress(seeds, programId) → { address, bump } */
export async function findProgramAddress(seeds, programId) {
  for (let bump = 255; bump >= 0; bump--) {
    const address = await createProgramAddress([...seeds, Uint8Array.of(bump)], programId);
    if (address) return { address, bump };
  }
  throw new Error('unable to find a viable program address bump seed');
}

export function pubkeyBytes(address) {
  return decodeBase58(address);
}
