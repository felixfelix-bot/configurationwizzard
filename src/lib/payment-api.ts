const GATEWAY_PORT = 2121;

function getGatewayBase(): string {
  const host = window.location.hostname || '192.168.1.1';
  return `http://${host}:${GATEWAY_PORT}`;
}

/**
 * Reads the `clientmac` query parameter from the current URL.
 * Nodogsplash preauth redirects with ?clientmac=XX:XX:XX:XX:XX:XX
 * Returns null if not present.
 */
export function getClientMacFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('clientmac');
}

export interface PricingInfo {
  metric: 'milliseconds' | 'bytes';
  stepSize: number;
  pricePerStep: number;
  unit: string;
  mintUrl: string;
  mintUrls: string[];
  minSteps: number;
  /**
   * Whether the selected mint's Lightning backend was verified working.
   * - New backend (PR #181): true only when a `["supports_ln", mintUrl, "true"]`
   *   tag is present for this mint. Absent tag => LN down => hide/grey-out tab.
   * - Old backend (no supports_ln tags at all): defaults to true so Lightning
   *   stays available everywhere (graceful backward compatibility).
   */
  supportsLN: boolean;
}

/**
 * Thrown when the gateway returns a kind:21023 notice event (e.g.
 * "no reachable mints") during pricing fetch. The captive portal catches this
 * to show a friendly "Setting up payment system, please wait..." message
 * instead of crashing or rendering a broken/empty pricing card.
 */
export class GatewaySetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewaySetupError';
  }
}

export interface SessionEvent {
  allotment: number;
  metric: string;
  startTime: number;
  deviceMac: string;
}

export interface NoticeEvent {
  code: string;
  message: string;
}

export interface LnInvoiceRequest {
  amount: number;
  mint_url: string;
}

export interface LnInvoiceResponse {
  status: number;
  quote: string;
  invoice?: string;
  mint_url: string;
  amount: number;
  expiry?: number;
  state?: string;
  access_granted?: boolean;
  allotment?: number;
  metric?: string;
  error?: string;
}

export interface BalanceResponse {
  status: number;
  session_active: boolean;
  metric?: string;
  usage?: number;
  allotment?: number;
  remaining?: number;
  start_time?: number;
}

export type PaymentResult =
  | { ok: true; session: SessionEvent }
  | { ok: false; error: NoticeEvent };

export async function fetchPricing(): Promise<PricingInfo> {
  const res = await fetch(getGatewayBase() + '/');
  if (!res.ok) throw new Error(`Pricing fetch failed: ${res.status}`);
  const event = await res.json();
  // kind:21023 is a NIP-61 notice event — the gateway has no reachable mints
  // (e.g. booted before WAN/DNS came up, or every mint is down). Show a
  // friendly "setting up" message instead of a broken pricing card.
  if (event.kind === 21023) {
    const notice = parseKind21023(event);
    throw new GatewaySetupError(notice.message || 'Setting up payment system, please wait...');
  }
  return parseKind10021(event);
}

export async function fetchWhoami(): Promise<string> {
  const res = await fetch(getGatewayBase() + '/whoami');
  if (!res.ok) throw new Error('Whoami fetch failed');
  const text = await res.text();
  const match = text.match(/mac=([0-9a-fA-F:]+)/);
  if (!match) throw new Error('Could not parse MAC from whoami response');
  return match[1];
}

export async function payCashu(token: string, mac?: string): Promise<PaymentResult> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
  let body: string = token;
  if (mac) {
    // Pass mac as a custom header since the endpoint expects raw token body
    headers['X-Client-Mac'] = mac;
  }
  const res = await fetch(getGatewayBase() + '/' + (mac ? `?mac=${encodeURIComponent(mac)}` : ''), {
    method: 'POST',
    headers,
    body,
  });
  const event = await res.json();

  if (event.kind === 1022) {
    return { ok: true, session: parseKind1022(event) };
  }
  if (event.kind === 21023) {
    return { ok: false, error: parseKind21023(event) };
  }

  if (!res.ok) {
    return { ok: false, error: { code: 'http-error', message: `Payment failed (${res.status})` } };
  }

  return { ok: false, error: { code: 'unexpected-response', message: 'Unexpected response from payment server' } };
}

export async function createLnInvoice(amount: number, mintUrl: string, mac?: string): Promise<LnInvoiceResponse> {
  const payload: Record<string, any> = { amount, mint_url: mintUrl };
  if (mac) payload.mac = mac;
  const res = await fetch(getGatewayBase() + '/ln-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function pollLnInvoice(quoteId: string, mac?: string): Promise<LnInvoiceResponse> {
  let url = getGatewayBase() + `/ln-invoice?quote=${encodeURIComponent(quoteId)}`;
  if (mac) url += `&mac=${encodeURIComponent(mac)}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchSessionBalance(): Promise<BalanceResponse> {
  const res = await fetch(getGatewayBase() + '/balance');
  return res.json();
}

function parseKind10021(event: any): PricingInfo {
  const tags = event.tags || [];
  let metric: PricingInfo['metric'] = 'milliseconds';
  let stepSize = 1;
  let pricePerStep = 1;
  let unit = 'sats';
  let mintUrl = '';
  const mintUrls: string[] = [];
  let minSteps = 0;

  // Track which mints advertised Lightning capability via supports_ln tags
  // (PR #181 / TIP-02). Format: ["supports_ln", "<mint_url>", "true"].
  const lnCapableMints = new Set<string>();
  let sawAnySupportsLnTag = false;

  for (const tag of tags) {
    if (tag[0] === 'metric') {
      metric = tag[1] === 'bytes' ? 'bytes' : 'milliseconds';
    } else if (tag[0] === 'step_size') {
      stepSize = parseInt(tag[1], 10) || 1;
    } else if (tag[0] === 'price_per_step') {
      pricePerStep = parseInt(tag[2], 10) || 1;
      unit = tag[3] || 'sats';
      const url = tag[4] || '';
      if (url) {
        mintUrl = mintUrl || url; // first mint becomes default for backward compat
        if (!mintUrls.includes(url)) mintUrls.push(url);
      }
      minSteps = parseInt(tag[5], 10) || 0;
    } else if (tag[0] === 'supports_ln') {
      sawAnySupportsLnTag = true;
      // Only a "true" value for a known mint advertises LN capability.
      if (tag[2] === 'true' && tag[1]) {
        lnCapableMints.add(tag[1]);
      }
    }
  }

  // Backward compatibility: an old backend (v0.5.0-alpha3 and earlier) emits
  // NO supports_ln tags at all. In that case we cannot tell which mints have a
  // working LN backend, so we default to Lightning being available (preserves
  // existing behaviour). A new backend that emits supports_ln tags is
  // authoritative: Lightning is shown ONLY for mints it explicitly marks.
  const supportsLN = sawAnySupportsLnTag ? lnCapableMints.has(mintUrl) : true;

  return { metric, stepSize, pricePerStep, unit, mintUrl, mintUrls, minSteps, supportsLN };
}

function parseKind1022(event: any): SessionEvent {
  const tags = event.tags || [];
  let allotment = 0;
  let metric = '';
  let startTime = 0;
  let deviceMac = '';

  for (const tag of tags) {
    if (tag[0] === 'allotment') allotment = parseInt(tag[1], 10) || 0;
    else if (tag[0] === 'metric') metric = tag[1] || '';
    else if (tag[0] === 'start-time') startTime = parseInt(tag[1], 10) || 0;
    else if (tag[0] === 'device-identifier' && tag[1] === 'mac') deviceMac = tag[2] || '';
  }

  return { allotment, metric, startTime, deviceMac };
}

function parseKind21023(event: any): NoticeEvent {
  const tags = event.tags || [];
  let code = 'unknown';
  for (const tag of tags) {
    if (tag[0] === 'code') code = tag[1] || 'unknown';
  }
  return { code, message: event.content || 'Unknown error' };
}

export function computeSizeOptions(pricing: PricingInfo): { label: string; sats: number; steps: number }[] {
  const { metric, stepSize, pricePerStep, minSteps } = pricing;

  const rawSteps = [
    { units: 15 * 60, label: '15 min' },
    { units: 60 * 60, label: '1 hour' },
    { units: 10 * 60 * 60, label: '10 hours' },
  ];

  if (metric === 'bytes') {
    rawSteps.length = 0;
    rawSteps.push(
      { units: 100 * 1048576, label: '100 MB' },
      { units: 1024 * 1048576, label: '1 GB' },
      { units: 10 * 1024 * 1048576, label: '10 GB' },
    );
  }

  const minUnits = minSteps * stepSize;
  const options = rawSteps
    .filter(r => r.units >= minUnits)
    .map(r => {
      const steps = Math.ceil(r.units / stepSize);
      const sats = steps * pricePerStep;
      return { label: r.label, sats, steps };
    });

  return options;
}
