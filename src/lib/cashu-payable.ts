// Pure helper for the captive-portal Cashu "is this token payable" check.
//
// A pasted Cashu token is only actionable if its total value covers at least
// the advertised minimum purchase (in steps). Anything smaller must be blocked
// from Continue and surfaced to the operator as "not enough", rather than
// silently allowing a no-op pay. Kept as a pure function (no React) so it can
// be unit-tested and reused by both the render logic and the pay handler.

export interface PayableInput {
  /** resolved minimum number of steps (>= 1, defaults to 1 when absent) */
  minSteps?: number;
  /** sats per step, as advertised in the price_per_step tag */
  pricePerStep?: number;
  /** total value of the pasted token, in sats */
  amount?: number;
}

export interface PayableResult {
  /** true when the token is valid AND covers the minimum purchase */
  payable: boolean;
  /** resolved minimum number of steps */
  minSteps: number;
  /** resolved minimum sats required */
  minSats: number;
}

/**
 * Determine whether a pasted token amount is enough for the minimum purchase.
 *
 * The threshold is `max(minSteps, 1) * pricePerStep`, NOT "one step". A token
 * that covers some steps but fewer than the advertised minimum must not be
 * payable (e.g. minSteps=3, token covers 2 steps). When pricing is absent or
 * pricePerStep is 0 the result is non-payable (nothing to buy into).
 */
export function isTokenPayable(input: PayableInput): PayableResult {
  const minSteps = Math.max(input.minSteps ?? 1, 1);
  const pricePerStep = Number(input.pricePerStep);
  const amount = Number(input.amount);

  const minSats = minSteps * pricePerStep;

  const payable =
    Number.isFinite(pricePerStep) &&
    pricePerStep > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount >= minSats;

  return { payable, minSteps, minSats };
}
