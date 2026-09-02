// Client-side Cashu token validation.
//
// Only token DECODING/VALIDATION happens here — no wallet operations (mint,
// melt, receive). We decode the token, extract its proofs, sum their amounts,
// and report the result so the captive portal can give instant feedback before
// the user taps Continue. The backend re-decodes authoritatively; this module
// is a thin UX gate, NOT the source of truth for payment acceptance.
//
// V2-KEYSET FIX (2026-09-02): previously decoded with getDecodedToken(token,
// []) which, in cashu-ts v4, REQUIRES the keysetIds list and throws on any
// token whose proof carries a v2 (01-prefixed) keyset ID — even a full-length
// one — when the list is empty ("A short keyset ID v2 was encountered, but got
// no keysets to map it to."). v0 (00-prefixed) tokens decoded fine, so v0 mint
// payments worked while v2 mint payments (coinos, minibits, testnut = 100% of
// the sat mints in some deployments) were blocked client-side. We now use
// getTokenMetadata() — the idiomatic cashu-ts v4 pre-wallet decoder, which
// parses the token without keyset resolution — so v0 AND v2 keyset tokens both
// decode. The backend (tollgate-module-basic-go / gonuts v0.11.1) uses V3/V4
// fallback decode + resolveShortKeysetIds and has always accepted v2.

import { getTokenMetadata } from '@cashu/cashu-ts';

export interface CashuValidationResult {
  valid: boolean;
  /** total sats in token (sum of proof amounts, as a JS number) */
  amount?: number;
  /** number of proofs in the token */
  proofCount?: number;
  /** mint URL from token if available */
  mint?: string;
  /** error message if invalid */
  error?: string;
}

/**
 * Normalize a mint URL the same way the backend treats them, so a portal-side
 * accepted-mint comparison does not diverge from what the backend will accept.
 *
 * Mirror of the canonical comparison used by tollgate-module-basic-go
 * (MintURLMatches, src/tollwallet/tollwallet.go): both URLs are parsed, the
 * host is compared case-insensitively (EqualFold), the scheme exactly, and the
 * path via normalizePath — which strips exactly ONE trailing slash and treats
 * an empty path as "/". We reproduce that: lowercase host, keep the scheme,
 * strip a single trailing slash from the path, and map an empty path to "/".
 *
 * @param mint raw mint URL
 * @returns normalized URL, or '' if unparseable
 */
export function normalizeMintUrl(mint: string): string {
  if (typeof mint !== 'string' || !/^https?:\/\//i.test(mint)) return '';
  try {
    const u = new URL(mint.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase();
    // hostname lowercases; also fold in any explicit port. No userinfo.
    const authority = host + (u.port ? `:${u.port}` : '');
    // Backend normalizePath: strip exactly ONE trailing slash; empty path -> "/".
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '') path = '/';
    return `${u.protocol}//${authority}${path}`;
  } catch {
    return '';
  }
}

/**
 * Validate a Cashu token string: check format, decode it, and report amount /
 * mint / proof count. Returns a descriptive result object and NEVER throws to
 * the caller.
 *
 * Hardening (all baked in):
 *  1. `metadata.amount` is an Amount OBJECT (bigint-backed), not a number —
 *     converted via `.toNumber()` before any arithmetic. Never string-add.
 *  2. Unit gate: if a unit is present and !== 'sat' -> reject (a USD-keyset
 *     token must not pass against a sat price); if absent -> default to 'sat'.
 *  3. Mint fail-closed: if the token carries no mint (possible for V4 CBOR
 *     tokens without the `m` field) -> reject. When an `acceptedMints` list is
 *     supplied, the token's mint is compared (via normalizeMintUrl) and a
 *     mismatch rejects — mirroring the backend, so portal and backend agree.
 *  4. try/catch retained: getTokenMetadata still throws on malformed b64 or
 *     CBOR / bad version byte / multi-entry V3 shapes.
 *  5. incompleteProofs is intentionally NOT surfaced: presence of proofs !=
 *     DLEQ validity, so we never advertise a spurious "DLEQ verified".
 *  6. Token string is trimmed; URL-pasted forms are normalized before decoding
 *     (see normalizeTokenInput).
 *
 * @param token raw Cashu token string (e.g. "cashuA..." / "cashuB...")
 * @param acceptedMints optional list of mint URLs this portal accepts; if
 *   provided, the token's mint must normalize-match one of them.
 */
export function validateCashuToken(
  token: string,
  acceptedMints?: string[],
): CashuValidationResult {
  // Empty / non-string token
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, error: 'Please paste a Cashu token.' };
  }

  const input = normalizeTokenInput(token);
  if (!input) {
    return {
      valid: false,
      error: 'Please paste a valid Cashu token.',
    };
  }

  // Cashu tokens must start with "cashu"
  if (!/^cashu/i.test(input)) {
    return {
      valid: false,
      error: 'Cashu tokens should start with "cashu".',
    };
  }

  // Decode via getTokenMetadata — never needs keyset IDs, works for both v0
  // and v2 keyset tokens (THE v2-keyset fix). Still throws on malformed /
  // unsupported input, which we report as a friendly decode failure.
  let metadata;
  try {
    metadata = getTokenMetadata(input);
  } catch {
    return {
      valid: false,
      error: 'Could not decode this token. It may be corrupted or unsupported.',
    };
  }

  if (!metadata) {
    return {
      valid: false,
      error: 'Could not decode this token. It may be corrupted or unsupported.',
    };
  }

  // Hardening 3 (mint fail-closed): a token with no mint cannot be trusted for
  // display of its origin and cannot be compared against accepted mints.
  const mint = metadata.mint && typeof metadata.mint === 'string' ? metadata.mint : undefined;
  if (!mint) {
    return {
      valid: false,
      error: 'This token has no mint URL and cannot be accepted.',
    };
  }

  // Hardening 3 (accepted-mints gate): compare using the backend's
  // normalization so portal accepts exactly what the backend will accept.
  if (Array.isArray(acceptedMints) && acceptedMints.length > 0) {
    const normalizedMint = normalizeMintUrl(mint);
    const accepted = acceptedMints.some(
      (acceptedMint) => normalizeMintUrl(acceptedMint) === normalizedMint,
    );
    if (!accepted || !normalizedMint) {
      return {
        valid: false,
        error: `This token is from a mint (${mint}) that is not accepted here.`,
      };
    }
  }

  // Hardening 2 (unit gate): a token explicitly denominated in a non-sat unit
  // must not pass against a sat price.
  const unit = metadata.unit;
  if (unit !== undefined && unit !== null && String(unit) !== 'sat') {
    return {
      valid: false,
      error: `This token's unit ("${unit}") is not "sat". Only sat-unit tokens can be accepted.`,
    };
  }
  // Unit absent -> default to "sat" (accepted).

  // Hardening 1: amount is an Amount OBJECT. Normalize to a plain number before
  // any arithmetic. Never concatenate strings.
  const rawAmount = metadata.amount as unknown as
    | { toNumber?: () => number; toNumberUnsafe?: () => number }
    | number
    | undefined;

  let amount: number;
  if (typeof rawAmount === 'number') {
    amount = rawAmount;
  } else if (rawAmount && typeof (rawAmount as { toNumber?: () => number }).toNumber === 'function') {
    try {
      amount = (rawAmount as { toNumber: () => number }).toNumber();
    } catch {
      amount = 0;
    }
  } else if (rawAmount && typeof (rawAmount as { toNumberUnsafe?: () => number }).toNumberUnsafe === 'function') {
    try {
      amount = (rawAmount as { toNumberUnsafe: () => number }).toNumberUnsafe();
    } catch {
      amount = 0;
    }
  } else {
    amount = 0;
  }

  // Hardening 4/5: proof count is a display-only sanity check (a token with no
  // proofs has no spendable value); we do NOT claim DLEQ validity.
  const proofCount = Array.isArray(metadata.incompleteProofs)
    ? metadata.incompleteProofs.length
    : 0;

  if (proofCount === 0 || amount <= 0) {
    return {
      valid: false,
      error: 'No spendable value found in this token.',
    };
  }

  return {
    valid: true,
    amount,
    proofCount,
    mint,
  };
}

/**
 * Normalize the raw input the user pasted. Handles:
 *  - surrounding whitespace
 *  - URL-embedded tokens, e.g. `https://example.com?token=cashuA...`
 *  - `cashu://` prefixed strings (NUT-00 allows a `cashu://` URI scheme in some
 *    share formats), which we strip to the bare token.
 *
 * @returns a token string ready to decode, or '' if no usable token extracted.
 */
function normalizeTokenInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // cashu:// prefix: take everything after the scheme prefix.
  const cashuScheme = trimmed.match(/^cashu:\/\/(.+)$/i);
  if (cashuScheme) {
    return stripQuery(cashuScheme[1].trim());
  }

  // http(s) URL containing a token query param.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      // Prefer an explicit token query parameter; fall back to the fragment.
      const embedded =
        (u.searchParams && u.searchParams.get('token')) ||
        (u.hash && hashToken(u.hash));
      if (embedded) return stripQuery(embedded.trim());
      // If the whole thing is a URL but no token param, treat as unusable only
      // if it does not itself look like a bare token.
      return /^cashu/i.test(trimmed) ? stripQuery(trimmed) : '';
    } catch {
      return /^cashu/i.test(trimmed) ? stripQuery(trimmed) : '';
    }
  }

  return stripQuery(trimmed);
}

/** Extract a token from a URL fragment like `#token=cashuA...` / `#cashuA...`. */
function hashToken(hash: string): string {
  const h = hash.replace(/^#/, '');
  const m = h.match(/token=(.+)$/i);
  // If a token= pair exists, use it; otherwise use whatever follows the # if it
  // looks like a token.
  if (m) return m[1];
  return /^cashu/i.test(h) ? h : '';
}

/**
 * Strip a trailing `?token=...` fragment (and any subsequent query) if the
 * string happens to carry one. Kept conservative: only strips a leading known
 * query marker, never the token body.
 */
function stripQuery(s: string): string {
  // The token itself contains no '?'; a trailing ?... is a leftover URL query.
  const idx = s.indexOf('?');
  return idx > 0 ? s.slice(0, idx) : s;
}
