// Client-side Cashu token validation.
//
// Only token DECODING/VALIDATION happens here — no wallet operations (mint,
// melt, receive). We decode the token, extract its proofs, sum their amounts,
// and report the result so the captive portal can give instant feedback before
// the user taps Continue.

import { getDecodedToken, type Proof, type Token } from '@cashu/cashu-ts';

export interface CashuValidationResult {
  valid: boolean;
  /** total sats in token (sum of proof amounts) */
  amount?: number;
  /** number of proofs in the token */
  proofCount?: number;
  /** mint URL from token if available */
  mint?: string;
  /** error message if invalid */
  error?: string;
}

/**
 * Safely extract proofs from a decoded token, handling the normalized v4 shape
 * (`token.proofs`) as well as legacy/alternate shapes (`token.token[].proofs`,
 * `token.token.proofs`, `token.tokens[].proofs`) for robustness.
 */
function extractProofs(decoded: Token): Proof[] {
  // Primary path: cashu-ts v4 normalizes to `{ mint, proofs, ... }`.
  if (Array.isArray(decoded.proofs)) {
    return decoded.proofs;
  }

  // Defensive fallbacks for alternate/legacy shapes. Cast through unknown to
  // inspect runtime shape without using `any`.
  const obj = decoded as unknown as Record<string, unknown>;

  // Shape: { token: [ { proofs: [...] }, ... ] }
  if (Array.isArray(obj.token)) {
    const collected: Proof[] = [];
    for (const entry of obj.token) {
      const ep = (entry as Record<string, unknown>)?.proofs;
      if (Array.isArray(ep)) collected.push(...(ep as Proof[]));
    }
    if (collected.length > 0) return collected;
  }

  // Shape: { token: { proofs: [...] } }
  if (obj.token && typeof obj.token === 'object') {
    const tp = (obj.token as Record<string, unknown>).proofs;
    if (Array.isArray(tp)) return tp as Proof[];
  }

  // Shape: { tokens: [ { proofs: [...] }, ... ] }
  if (Array.isArray(obj.tokens)) {
    const collected: Proof[] = [];
    for (const entry of obj.tokens) {
      const ep = (entry as Record<string, unknown>)?.proofs;
      if (Array.isArray(ep)) collected.push(...(ep as Proof[]));
    }
    if (collected.length > 0) return collected;
  }

  return [];
}

/**
 * Convert a proof's amount to a plain number.
 *
 * In cashu-ts v4, `proof.amount` is an `Amount` class instance. We use the
 * unsafe conversion because satoshi values are always well within
 * `Number.MAX_SAFE_INTEGER`.
 */
function proofAmountToNumber(proof: Proof): number {
  const amt = proof.amount as unknown as {
    toNumberUnsafe?: () => number;
    toNumber?: () => number;
  };
  if (amt && typeof amt.toNumberUnsafe === 'function') {
    return amt.toNumberUnsafe();
  }
  if (amt && typeof amt.toNumber === 'function') {
    try {
      return amt.toNumber();
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Validate a Cashu token string: check format, decode it, extract proofs, and
 * sum their amounts. Returns a descriptive result object.
 *
 * @param token raw Cashu token string (e.g. "cashuA..." / "cashuB...")
 */
export function validateCashuToken(token: string): CashuValidationResult {
  // Empty / non-string token
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, error: 'Please paste a Cashu token.' };
  }

  const trimmed = token.trim();

  // Cashu tokens must start with "cashu"
  if (!trimmed.startsWith('cashu')) {
    return {
      valid: false,
      error: 'Cashu tokens should start with "cashu".',
    };
  }

  // Decode the token. In cashu-ts v4, getDecodedToken requires a keysetIds
  // argument; pass an empty array — this works for tokens with full (v1)
  // keyset IDs. Short (v2) keyset IDs without known keysets will throw, which
  // we report as a decode failure.
  let decoded: Token;
  try {
    decoded = getDecodedToken(trimmed, []);
  } catch {
    // getDecodedToken can fail for two reasons:
    // 1. Actually corrupted / malformed token (rare)
    // 2. v2/v4 short keyset IDs without known keysets — the
    //    empty `[]` keyset list means cashu-ts can't expand
    //    short keyset IDs, so it throws. The token itself may
    //    be perfectly valid — the backend (tollgate-module-basic-go)
    //    uses gonuts' DecodeToken which handles short keysets
    //    natively. See: client-privacy-separation AGENTS.md
    //    boundary.
    if (trimmed.startsWith('cashuB')) {
      // v4 CBOR token — the empty keyset list is likely the issue.
      return {
        valid: false,
        error:
          'This token uses a short keyset ID that the portal cannot ' +
          'decode without keyset data from the mint. The token is ' +
          'likely valid — submit it anyway or try one from a different mint.',
      };
    }
    return {
      valid: false,
      error:
        'Could not decode this token. It may use an unsupported ' +
        'format or be corrupted. Submit it anyway — the router will ' +
        'validate it.',
    };
  }

  if (!decoded) {
    return {
      valid: false,
      error: 'Could not decode this token. It may be corrupted or unsupported.',
    };
  }

  // Extract proofs from the decoded token
  const proofs = extractProofs(decoded);
  if (!proofs || proofs.length === 0) {
    return {
      valid: false,
      error: 'No proofs found in this token. It has no spendable value.',
    };
  }

  // Sum the proof amounts
  const totalAmount = proofs.reduce((sum, proof) => {
    return sum + proofAmountToNumber(proof);
  }, 0);

  return {
    valid: true,
    amount: totalAmount,
    proofCount: proofs.length,
    mint: decoded.mint || undefined,
  };
}
