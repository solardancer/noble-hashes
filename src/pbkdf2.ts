import { hmac } from './hmac';
// prettier-ignore
import {
  Hash, CHash, Input, createView, toBytes, assertNumber, assertHash, checkOpts, asyncLoop
} from './utils';

// PBKDF (RFC 2898)
export type Pbkdf2Opt = {
  c: number; // Iterations
  dkLen?: number; // Desired key length in bytes (Intended output length in octets of the derived key
  asyncTick?: number; // Maximum time in ms for which async function can block execution
};
// Common prologue and epilogue for sync/async functions
function pbkdf2Init(hash: CHash, _password: Input, _salt: Input, _opts: Pbkdf2Opt) {
  assertHash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  assertNumber(c);
  assertNumber(dkLen);
  assertNumber(asyncTick);
  if (c < 1) throw new Error('PBKDF2: iterations (c) should be >= 1');
  const password = toBytes(_password);
  const salt = toBytes(_salt);
  // DK = PBKDF2(PRF, Password, Salt, c, dkLen);
  const DK = new Uint8Array(dkLen);
  // U1 = PRF(Password, Salt + INT_32_BE(i))
  const PRF = hmac.init(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt);
  return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}

function pbkdf2Output(PRF: Hash, PRFSalt: Hash, DK: Uint8Array, prfW: Hash, u: Uint8Array) {
  PRF._clean();
  PRFSalt._clean();
  if (prfW) prfW._clean();
  u.fill(0);
  return DK;
}

export function pbkdf2(hash: CHash, password: Input, salt: Input, _opts: Pbkdf2Opt) {
  const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, _opts);
  let prfW: any; // Working copy
  const arr = new Uint8Array(4);
  const view = createView(arr);
  const u = new Uint8Array(PRF.outputLen);
  // DK = T1 + T2 + ⋯ + Tdklen/hlen
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    // Ti = F(Password, Salt, c, i)
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
    // U1 = PRF(Password, Salt + INT_32_BE(i))
    (prfW = PRFSalt._cloneInto(prfW)).update(arr)._writeDigest(u);
    Ti.set(u.subarray(0, Ti.length));
    for (let ui = 1; ui < c; ui++) {
      // Uc = PRF(Password, Uc−1)
      PRF._cloneInto(prfW).update(u)._writeDigest(u);
      for (let i = 0; i < Ti.length; i++) Ti[i] ^= u[i];
    }
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}

export async function pbkdf2Async(hash: CHash, password: Input, salt: Input, _opts: Pbkdf2Opt) {
  const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, _opts);
  let prfW: any; // Working copy
  const arr = new Uint8Array(4);
  const view = createView(arr);
  const u = new Uint8Array(PRF.outputLen);
  // DK = T1 + T2 + ⋯ + Tdklen/hlen
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    // Ti = F(Password, Salt, c, i)
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
    // U1 = PRF(Password, Salt + INT_32_BE(i))
    (prfW = PRFSalt._cloneInto(prfW)).update(arr)._writeDigest(u);
    Ti.set(u.subarray(0, Ti.length));
    await asyncLoop(c - 1, asyncTick, (i) => {
      // Uc = PRF(Password, Uc−1)
      PRF._cloneInto(prfW).update(u)._writeDigest(u);
      for (let i = 0; i < Ti.length; i++) Ti[i] ^= u[i];
    });
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}
