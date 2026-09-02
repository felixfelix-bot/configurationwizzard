// Client-side Cashu token validation tests.
//
// NOTE ON TEST HARNESS: this repo had no test runner. We added vitest as the
// minimal devDependency (kept footprint small vs jest/others). vitest was
// chosen because it is the same ecosystem as the existing vite (^8.0.12)
// toolchain — a single Vite-driven dependency graph, ESM-native, near-zero
// config for a single file of tests, and runs in well under a second. It is
// pinned to ^4.1.11, which is >= the 4.1.0 GHSA-5xrq-8626-4rwp patch;
// GHSA-9crc-q9x8-hgqq is fixed in 3.0.5, so 4.1.11 is clean of both (verified
// via `npm audit` — vitest itself reports zero advisories).
//
// The subject under test is the captive-portal UX gate only. The backend
// (tollgate-module-basic-go, gonuts v0.11.1) re-decodes authoritatively with
// V3/V4 fallback + resolveShortKeysetIds, so these tests pin the portal's
// *display* behavior without asserting anything about payment acceptance.
//
// Fixtures: valid V4 (cashuB/CBOR) tokens are produced with the library's own
// getEncodedToken encoder so they exercise the real decode path. The v2
// keyset fixture (01-prefixed full-length id) is THE bug: getDecodedToken(t,
// []) throws on it ("A short keyset ID v2 was encountered, but got no keysets
// to map it to.") while getTokenMetadata decodes it fine.

import { describe, it, expect, beforeAll } from 'vitest';
import { getEncodedToken } from '@cashu/cashu-ts';
import { validateCashuToken, normalizeMintUrl } from './cashu-validate';

const SAT_MINT = 'https://testnut.cashu.space';
// real 01-prefixed (v2) sat keyset from testnut.cashu.space (full length).
const V2_KEYSET = '0184237e63ce3423df7db2dced7329cff722a12d389a3b5d5c6b1f4762d9e1e';
const V0_KEYSET = '00b4cd27d8861a44';

function p(id: string, amount: number, secret: string) {
  return {
    id,
    amount,
    secret,
    C: '02' + 'a1b2c3d4'.repeat(8) + 'a1',
  };
}

// The exact fixtures that must trip the pre-fix getDecodedToken(t,[]) path.
let V2_TOKEN: string; // v2 keyset, sat -> THE BUG
let V0_TOKEN: string; // v0 keyset, sat -> regression guard
let USD_TOKEN: string; // v2 keyset, usd -> must be rejected
let NO_UNIT_TOKEN: string; // unit absent -> default sat
let NO_MINT_TOKEN: string; // mint absent (CBOR lacks m) -> fail closed
let V3_TOKEN: string; // V3 cashuA (b64-JSON) encoding -> dual-encoding coverage

beforeAll(() => {
  V0_TOKEN = getEncodedToken({
    mint: SAT_MINT,
    proofs: [p(V0_KEYSET, 5, 's-v0')],
    unit: 'sat',
  } as any);
  V2_TOKEN = getEncodedToken({
    mint: SAT_MINT,
    proofs: [p(V2_KEYSET, 5, 's-v2')],
    unit: 'sat',
  } as any);
  USD_TOKEN = getEncodedToken({
    mint: SAT_MINT,
    proofs: [p(V2_KEYSET, 5, 's-usd')],
    unit: 'usd',
  } as any);
  NO_UNIT_TOKEN = getEncodedToken({
    mint: SAT_MINT,
    proofs: [p(V0_KEYSET, 3, 's-nounit')],
  } as any);
  NO_MINT_TOKEN = getEncodedToken({
    proofs: [p(V0_KEYSET, 5, 's-nomint')],
    unit: 'sat',
  } as any);
  // V3 cashuA fixture: "cashuA" + base64(JSON). getEncodedToken only emits
  // V4 cashuB (CBOR), so build the V3 form by hand to exercise the OTHER
  // encoding end-to-end through the hardened path.
  const v3json = {
    token: [{ mint: SAT_MINT, proofs: [p(V2_KEYSET, 5, 's-v3')] }],
    unit: 'sat',
  };
  V3_TOKEN = 'cashuA' + Buffer.from(JSON.stringify(v3json)).toString('base64');
});

const MALFORMED_TOKEN = 'cashuB...not-valid!!';

describe('validateCashuToken', () => {
  it('accepts a v0-keyset (00-prefix) sat token', () => {
    const res = validateCashuToken(V0_TOKEN);
    expect(res.valid).toBe(true);
    expect(res.amount).toBe(5);
    expect(res.proofCount).toBe(1);
    expect(res.mint).toBe(SAT_MINT);
  });

  it('accepts a v2-keyset (01-prefix) sat token via the metadata path', () => {
    // Pre-fix this throws inside getDecodedToken -> returns "Could not decode"
    // (RED). Post-fix getTokenMetadata decodes it.
    const res = validateCashuToken(V2_TOKEN);
    expect(res.valid).toBe(true);
    expect(res.amount).toBe(5);
    expect(res.proofCount).toBe(1);
    expect(res.mint).toBe(SAT_MINT);
  });

  it('accepts a V3 cashuA (b64-JSON) token end-to-end', () => {
    // Dual-encoding coverage: getEncodedToken only emits V4 cashuB (CBOR).
    // A V3 cashuA token (base64 JSON) must also validate through the hardened
    // path — prior work never recorded which encoding was exercised.
    const res = validateCashuToken(V3_TOKEN);
    expect(res.valid).toBe(true);
    expect(res.amount).toBe(5);
    expect(res.proofCount).toBe(1);
    expect(res.mint).toBe(SAT_MINT);
  });

  it('rejects a USD-unit token with a clear error', () => {
    const res = validateCashuToken(USD_TOKEN);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/unit/i);
  });

  it('defaults an absent unit to sat and passes', () => {
    const res = validateCashuToken(NO_UNIT_TOKEN);
    expect(res.valid).toBe(true);
    expect(res.amount).toBe(3);
  });

  it('fails closed when the token has no mint', () => {
    const res = validateCashuToken(NO_MINT_TOKEN);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/mint/i);
  });

  it('catches malformed tokens and returns a friendly error (no throw)', () => {
    expect(() => validateCashuToken(MALFORMED_TOKEN)).not.toThrow();
    const res = validateCashuToken(MALFORMED_TOKEN);
    expect(res.valid).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('uses numeric amount arithmetic, not string concatenation', () => {
    const twoProof = getEncodedToken({
      mint: SAT_MINT,
      proofs: [p(V0_KEYSET, 5, 'n-a'), p(V2_KEYSET, 5, 'n-b')],
      unit: 'sat',
    } as any);
    const res = validateCashuToken(twoProof);
    expect(res.valid).toBe(true);
    expect(res.amount).toBe(10);
    expect(typeof res.amount).toBe('number');
  });

  it('rejects a token whose mint is not in the accepted-mints list', () => {
    const ok = validateCashuToken(V0_TOKEN, [SAT_MINT]);
    expect(ok.valid).toBe(true);
    const rejected = validateCashuToken(V0_TOKEN, ['https://other.mint']);
    expect(rejected.valid).toBe(false);
    expect(rejected.error).toMatch(/mint/i);
  });

  it('normalizes trailing slashes + host case when comparing mint', () => {
    const res = validateCashuToken(V0_TOKEN, ['https://TESTNUT.cashu.space/']);
    expect(res.valid).toBe(true);
  });
});

describe('normalizeMintUrl', () => {
  it('strips trailing slashes and lowercases the host, preserving path', () => {
    expect(normalizeMintUrl('https://Mint.Minibits.Cash/Bitcoin/')).toBe(
      'https://mint.minibits.cash/Bitcoin',
    );
    // Backend normalizePath maps an empty path to "/", so a bare origin keeps
    // its root slash (mirrors MintURLMatches, not over-normalized).
    expect(normalizeMintUrl('https://mint.coinos.io/')).toBe('https://mint.coinos.io/');
  });

  it('returns empty string for unparseable input', () => {
    expect(normalizeMintUrl('not a url')).toBe('');
  });

  // Backend parity: tollgate-module-basic-go MintURLMatches uses
  // url.Parse + EqualFold(host) + normalizePath, where normalizePath strips
  // exactly ONE trailing slash (empty path -> "/"). Mirror that exactly so
  // the portal accepts precisely what the backend accepts.
  it('mirrors backend normalizePath: strips exactly one trailing slash', () => {
    // "/Bitcoin//" -> backend normalizePath -> "/Bitcoin/" (one slash stripped),
    // which is NOT equal to "/Bitcoin". Portal must not over-normalize.
    expect(normalizeMintUrl('https://mint.example.com/Bitcoin//')).toBe(
      'https://mint.example.com/Bitcoin/',
    );
  });

  it('mirrors backend normalizePath: empty path normalizes to root slash', () => {
    // Backend normalizePath("") -> "/". A bare origin with no path must
    // normalize to the root path, not an empty path.
    expect(normalizeMintUrl('https://mint.example.com')).toBe(
      'https://mint.example.com/',
    );
  });

  it('mirrors backend scheme sensitivity: http vs https differ', () => {
    expect(normalizeMintUrl('http://mint.example.com/Bitcoin')).toBe(
      'http://mint.example.com/Bitcoin',
    );
    expect(normalizeMintUrl('http://mint.example.com/Bitcoin')).not.toBe(
      normalizeMintUrl('https://mint.example.com/Bitcoin'),
    );
  });
});
