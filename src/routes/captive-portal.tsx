import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  fetchPricing,
  fetchWhoami,
  payCashu,
  createLnInvoice,
  pollLnInvoice,
  GatewaySetupError,
  type PricingInfo,
  type PaymentResult,
  computeSizeOptions,
} from '../lib/payment-api';
import { generateQRSVG } from '../lib/qr';
import { validateCashuToken, type CashuValidationResult } from '../lib/cashu-validate';

type Tab = 'lightning' | 'cashu';
type PortalPhase = 'loading' | 'select' | 'success' | 'error' | 'setup';

interface SizeOption {
  label: string;
  sats: number;
}

function formatSats(v: number): string {
  return v.toLocaleString() + ' sats';
}

function formatAllotment(metric: string, allotment: number): string {
  if (metric === 'milliseconds') {
    const mins = Math.round(allotment / 60000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}min` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${mins} min`;
  }
  const mb = allotment / 1048576;
  if (mb >= 1024) {
    const gb = mb / 1024;
    return gb >= 10 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
}

function getMinimumLabel(pricing: PricingInfo): string {
  const minUnits = pricing.minSteps * pricing.stepSize;
  if (pricing.metric === 'milliseconds') {
    return `Minimum purchase: ${Math.round(minUnits / 60000)} minutes`;
  }
  const mb = minUnits / 1048576;
  return mb >= 1024
    ? `Minimum purchase: ${(mb / 1024).toFixed(0)} GB`
    : `Minimum purchase: ${mb.toFixed(0)} MB`;
}

function getMoreSuffix(metric: string): string {
  return metric === 'milliseconds' ? 'min' : 'GB';
}

function getMorePlaceholder(metric: string): string {
  return metric === 'milliseconds' ? '60' : '1';
}

const LOGO_SRC = './assets/logo/colour/net4sats-logo-colour.png';

export default function CaptivePortal() {
  const [phase, setPhase] = useState<PortalPhase>('loading');
  const [tab, setTab] = useState<Tab>('lightning');
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([]);
  const [selectedSats, setSelectedSats] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [moreInput, setMoreInput] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [grantedText, setGrantedText] = useState('');
  const [pageError, setPageError] = useState('');
  const [setupMessage, setSetupMessage] = useState('Setting up payment system, please wait...');

  const [cashuToken, setCashuToken] = useState('');
  const [cashuError, setCashuError] = useState('');
  const [cashuPaying, setCashuPaying] = useState(false);
  const [cashuValidation, setCashuValidation] = useState<CashuValidationResult | null>(null);

  const [lnInvoice, setLnInvoice] = useState('');
  const [lnGenerating, setLnGenerating] = useState(false);
  const [lnGenerated, setLnGenerated] = useState(false);
  const [lnPolling, setLnPolling] = useState(false);
  const [lnTestMint, setLnTestMint] = useState(false);
  const [lnQuoteId, setLnQuoteId] = useState('');
  const [lnError, setLnError] = useState('');

  const moreRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pr, mac] = await Promise.allSettled([
          fetchPricing(),
          fetchWhoami(),
        ]);

        if (cancelled) return;

        if (pr.status === 'fulfilled') {
          setPricing(pr.value);
          const opts = computeSizeOptions(pr.value);
          setSizeOptions(opts);
          if (opts.length > 0) {
            setSelectedSats(opts[0].sats);
            setSelectedIdx(0);
          }
          // If the selected mint does not support Lightning (new backend with
          // PR #181 where supports_ln is authoritative), land the user on the
          // Cashu tab and grey-out Lightning instead of letting them hit a
          // guaranteed invoice failure.
          if (!pr.value.supportsLN) {
            setTab('cashu');
          }
        } else {
          const reason = pr.reason;
          if (reason instanceof GatewaySetupError) {
            // kind:21023 — gateway booted before WAN/mints came up, or every
            // mint is down. Show a friendly setup message and stop retrying
            // silently so the user understands the router is still starting.
            setSetupMessage(reason.message || 'Setting up payment system, please wait...');
            setTimeout(() => { if (!cancelled) setPhase('setup'); }, 400);
            if (mac.status === 'fulfilled') setDeviceMac(mac.value);
            return;
          }
          setPageError('Could not load pricing from gateway');
        }

        if (mac.status === 'fulfilled') {
          setDeviceMac(mac.value);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof GatewaySetupError) {
          setSetupMessage(err.message || 'Setting up payment system, please wait...');
          setTimeout(() => { if (!cancelled) setPhase('setup'); }, 400);
          return;
        }
        setPageError('Failed to connect to gateway');
      }
      setTimeout(() => {
        if (!cancelled) setPhase('select');
      }, 400);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(''), 6000);
    return () => clearTimeout(t);
  }, [pageError]);

  useEffect(() => {
    if (!lnError) return;
    const t = setTimeout(() => setLnError(''), 6000);
    return () => clearTimeout(t);
  }, [lnError]);

  useEffect(() => {
    if (!cashuError) return;
    const t = setTimeout(() => setCashuError(''), 6000);
    return () => clearTimeout(t);
  }, [cashuError]);

  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(() => {
      window.location.href = `http://${window.location.hostname}:8090/net4sats/balance.html`;
    }, 0);
    return () => clearTimeout(t);
  }, [phase]);

  const handleSelectSize = useCallback((idx: number) => {
    if (idx === sizeOptions.length) {
      setShowMore(true);
      setTimeout(() => moreRef.current?.focus(), 50);
      return;
    }
    setSelectedIdx(idx);
    setShowMore(false);
    setMoreInput('');
    setSelectedSats(sizeOptions[idx].sats);
    setLnInvoice('');
    setLnGenerated(false);
    setLnGenerating(false);
    setLnTestMint(false);
    setLnError('');
    setCashuError('');
    setCashuToken('');
    setCashuValidation(null);
  }, [sizeOptions]);

  const handleMoreInput = useCallback((val: string) => {
    setMoreInput(val);
    const n = parseFloat(val);
    if (!n || !pricing) return;
    let sats: number;
    if (pricing.metric === 'milliseconds') {
      const ms = n * 60000;
      const steps = Math.ceil(ms / pricing.stepSize);
      sats = steps * pricing.pricePerStep;
    } else {
      const bytes = n * 1073741824;
      const steps = Math.ceil(bytes / pricing.stepSize);
      sats = steps * pricing.pricePerStep;
    }
    setSelectedSats(sats);
  }, [pricing]);

  const handleCashuInput = useCallback((val: string) => {
    setCashuToken(val);
    setCashuError('');
    const trimmed = val.trim();
    if (!trimmed) {
      setCashuValidation(null);
      return;
    }
    const result = validateCashuToken(val);
    setCashuValidation(result);
    if (!result.valid) {
      setCashuError(result.error || 'Invalid Cashu token.');
    }
  }, []);

  const handleCashuPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      handleCashuInput(text);
    } catch {
      setCashuError('Clipboard access denied. Please paste manually.');
    }
  }, [handleCashuInput]);

  const handleCashuPay = useCallback(async () => {
    if (!cashuValidation?.valid || !pricing) return;
    setCashuPaying(true);
    setCashuError('');
    try {
      const result: PaymentResult = await payCashu(cashuToken.trim());
      if (result.ok) {
        setGrantedText(formatAllotment(result.session.metric, result.session.allotment));
        setPhase('success');
      } else {
        setCashuError(result.error.message);
      }
    } catch (err: any) {
      setCashuError(err.message || 'Payment failed');
    } finally {
      setCashuPaying(false);
    }
  }, [cashuToken, cashuValidation, pricing]);

  const handleGenerateInvoice = useCallback(async () => {
    if (!pricing) return;
    setLnGenerating(true);
    setLnError('');
    setLnInvoice('');
    setLnGenerated(false);
    setLnTestMint(false);
    try {
      const res = await createLnInvoice(selectedSats, pricing.mintUrl);
      if (res.status === 0 || res.error) {
        setLnError(res.error || 'Failed to create invoice');
        setLnGenerating(false);
        return;
      }
      const invoice = res.invoice || '';
      if (!invoice) {
        setLnError('Failed to create invoice. Please try again.');
        setLnGenerating(false);
        return;
      }

      const isRealBolt11 = invoice.toLowerCase().startsWith('lnbc');
      setLnQuoteId(res.quote);

      if (isRealBolt11) {
        setLnInvoice(invoice);
        setLnGenerated(true);
      } else {
        setLnTestMint(true);
        setLnGenerated(true);
      }
      setLnGenerating(false);

      pollRef.current = window.setInterval(async () => {
        try {
          const poll = await pollLnInvoice(res.quote);
          if (poll.access_granted) {
            if (pollRef.current) clearInterval(pollRef.current);
            setLnPolling(false);
            const allotment = poll.allotment || 0;
            const metric = poll.metric || pricing.metric;
            setGrantedText(formatAllotment(metric, allotment));
            setPhase('success');
            window.dispatchEvent(new CustomEvent('portal-phase-change', { detail: { phase: 'success' } }));
          }
        } catch {
          // keep polling
        }
      }, 3000);
      setLnPolling(true);
    } catch (err: any) {
      setLnError(err.message || 'Invoice creation failed');
      setLnGenerating(false);
    }
  }, [pricing, selectedSats]);

  const isCashuValid = cashuValidation?.valid === true;
  const metric = pricing?.metric || 'milliseconds';

  const loadingHeader = (
    <div className="tollgate-captive-portal-header">
      <img src={LOGO_SRC} alt="net4sats" />
      <p className="powered-by">
        Powered by{' '}
        <a href="https://tollgate.me/" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'none' }}>
          TollGate
        </a>
      </p>
    </div>
  );

  const footer = (
    <div className="tollgate-captive-portal-footer">
      <p>
        {deviceMac && <><span>Device: {deviceMac}</span> &nbsp;·&nbsp; </>}
        net4sats
      </p>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href={`http://${window.location.hostname}:8090/#/login`} style={{ fontSize: 'var(--font-size-xsmall, 11px)', color: 'var(--text-dim, #888)', textDecoration: 'none', opacity: 0.7 }}>
          Admin
        </a>
        <a href={`http://${window.location.hostname}:8080/`} style={{ fontSize: 'var(--font-size-xsmall, 11px)', color: 'var(--text-dim, #888)', textDecoration: 'none', opacity: 0.7 }}>
          LuCI
        </a>
      </div>
    </div>
  );

  if (phase === 'loading') {
    return (
      <div className="tollgate-captive-portal">
        {loadingHeader}
        <div className="tollgate-captive-portal-content">
          <div className="tollgate-captive-portal-content-container">
            <div className="tollgate-captive-portal-tabs" role="tablist">
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-lightning" data-active="true" role="tab">⚡ Lightning</button>
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-cashu" data-active="false" role="tab">🥜 Cashu</button>
            </div>
            <div className="tollgate-captive-portal-view">
              <div className="tollgate-captive-portal-loading">
                <div className="cp-spinner big" />
                <span>Loading…</span>
              </div>
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="tollgate-captive-portal">
        {loadingHeader}
        <div className="tollgate-captive-portal-content">
          <div className="tollgate-captive-portal-content-container">
            <div className="tollgate-captive-portal-tabs" role="tablist">
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-lightning" data-active="true" role="tab">⚡ Lightning</button>
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-cashu" data-active="false" role="tab">🥜 Cashu</button>
            </div>
            <div className="tollgate-captive-portal-view">
              <div className="tollgate-captive-portal-access-granted">
                <div className="tollgate-captive-portal-access-granted-checkmark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="tollgate-captive-portal-access-granted-label">
                  <h2>Payment successful!</h2>
                  <p>You now have <strong>{grantedText}</strong> of internet access.</p>
                  <p className="small">Redirecting to your dashboard…</p>
                </div>
                <a
                  href={`http://${window.location.hostname}:8090/net4sats/balance.html`}
                  style={{
                    display: 'inline-block',
                    marginTop: '1rem',
                    padding: '0.7rem 1.5rem',
                    background: 'var(--color-cta, #f60)',
                    color: '#fff',
                    borderRadius: 'var(--border-radius, 12px)',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                >
                  Go to dashboard →
                </a>
              </div>
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="tollgate-captive-portal">
        {loadingHeader}
        <div className="tollgate-captive-portal-content">
          <div className="tollgate-captive-portal-content-container">
            <div className="tollgate-captive-portal-tabs" role="tablist">
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-lightning" data-active="true" role="tab">⚡ Lightning</button>
              <button className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-cashu" data-active="false" role="tab">🥜 Cashu</button>
            </div>
            <div className="tollgate-captive-portal-view">
              <div className="tollgate-captive-portal-loading">
                <div className="cp-spinner big" />
                <span>{setupMessage}</span>
              </div>
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="tollgate-captive-portal">
      <div className="tollgate-captive-portal-header">
        <img src={LOGO_SRC} alt="net4sats" />
        <p className="powered-by">
          Powered by{' '}
          <a href="https://tollgate.me/" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'none' }}>
            TollGate
          </a>
        </p>
      </div>

      {pageError && (
        <div className="error-msg" style={{ margin: '0 1.5rem 1rem' }}>
          <div className="dot" />
          <span>{pageError}</span>
        </div>
      )}

      {!pageError && pricing && (
        <div style={{ textAlign: 'center', padding: '0 1rem 0.5rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 700 }}>How much Internet would you like to buy?</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
            {getMinimumLabel(pricing)}
          </p>
        </div>
      )}

      <div className="tollgate-captive-portal-content">
        <div className="tollgate-captive-portal-content-container">
          {!pageError && pricing && (
            <>
              <div className="size-choices">
                {sizeOptions.map((opt, idx) => (
                  <button
                    key={opt.label}
                    className={`size-btn${idx === selectedIdx && !showMore ? ' active' : ''}`}
                    onClick={() => handleSelectSize(idx)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  className={`size-btn${showMore ? ' active' : ''}`}
                  onClick={() => handleSelectSize(sizeOptions.length)}
                >
                  More
                </button>
              </div>

              <div className={`more-input-wrap${showMore ? ' visible' : ''}`}>
                <div className="more-input-row">
                  <input
                    ref={moreRef}
                    type="number"
                    min="0"
                    placeholder={getMorePlaceholder(metric)}
                    value={moreInput}
                    onInput={(e) => handleMoreInput((e.target as HTMLInputElement).value)}
                  />
                  <span className="suffix">{getMoreSuffix(metric)}</span>
                </div>
              </div>
            </>
          )}
          <div className="tollgate-captive-portal-tabs" role="tablist">
            <button
              className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-lightning"
              data-active={tab === 'lightning' ? 'true' : 'false'}
              data-disabled={pricing && !pricing.supportsLN ? 'true' : 'false'}
              role="tab"
              aria-disabled={pricing ? !pricing.supportsLN : false}
              disabled={pricing ? !pricing.supportsLN : false}
              onClick={() => { if (!pricing || pricing.supportsLN) setTab('lightning'); }}
              title={pricing && !pricing.supportsLN ? 'Lightning is not available for this mint' : undefined}
            >
              ⚡ Lightning
            </button>
            <button
              className="tollgate-captive-portal-tabs-tab tollgate-captive-portal-tabs-tab-cashu"
              data-active={tab === 'cashu' ? 'true' : 'false'}
              role="tab"
              onClick={() => setTab('cashu')}
            >
              🥜 Cashu
            </button>
          </div>

          <div className="tollgate-captive-portal-view">
            {tab === 'lightning' && (
              <>
                <div className="tollgate-captive-portal-method-header">
                  <h2>
                    Pay with{' '}
                    <a href="https://bitcoin.org/" target="_blank" rel="noreferrer">
                      BTC Lightning
                    </a>{' '}
                    to access the internet.
                  </h2>
                </div>

                <div className="tollgate-captive-portal-method-input" style={{ textAlign: 'center', padding: '1.2rem', border: 'none' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0a0a0a' }}>
                    {formatSats(selectedSats)}
                  </div>
                </div>

                {lnGenerated && lnInvoice && !lnTestMint && (
                  <div style={{ textAlign: 'center', padding: '1rem', background: '#fff', borderRadius: 'var(--border-radius)' }}>
                    <div
                      style={{ width: '180px', height: '180px', margin: '0 auto 0.8rem' }}
                      dangerouslySetInnerHTML={{ __html: generateQRSVG(lnInvoice, 180) }}
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(lnInvoice); }}
                      style={{
                        fontSize: 'var(--font-size-xsmall)', color: 'rgba(0,0,0,0.5)',
                        background: 'none', border: '1px solid rgba(0,0,0,0.15)',
                        padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Copy invoice
                    </button>
                    {lnPolling && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        <div className="cp-spinner small" />
                        <span style={{ fontSize: 'var(--font-size-xsmall)', color: 'rgba(0,0,0,0.5)' }}>
                          Waiting for payment…
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {lnGenerated && lnTestMint && lnPolling && (
                  <div style={{ textAlign: 'center', padding: '1.5rem', background: '#fff', borderRadius: 'var(--border-radius)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div className="cp-spinner small" />
                      <span style={{ fontSize: '1rem', fontWeight: 600, color: '#0a0a0a' }}>
                        Processing payment…
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xsmall)', color: 'rgba(0,0,0,0.4)' }}>
                      Test mint is settling your invoice.
                    </div>
                  </div>
                )}

                {lnError && (
                  <div className="error-msg">
                    <div className="dot" />
                    <span>{lnError}</span>
                  </div>
                )}

                <div className="tollgate-captive-portal-method-submit">
                  <button
                    disabled={lnGenerating || lnGenerated || !pricing}
                    onClick={handleGenerateInvoice}
                    style={lnGenerated ? { background: '#32d74b', color: '#fff' } : undefined}
                  >
                    {lnGenerating ? 'Generating…' : lnGenerated && lnTestMint ? 'Processing…' : lnGenerated ? 'Invoice Generated ✓' : 'Generate Invoice'}
                  </button>
                </div>
              </>
            )}

            {tab === 'cashu' && (
              <>
                <div className="tollgate-captive-portal-method-header">
                  <h2>
                    Pay with{' '}
                    <a href="https://cashu.space/" target="_blank" rel="noreferrer">
                      Cashu
                    </a>{' '}
                    to access the internet.
                  </h2>
                </div>

                <div className="tollgate-captive-portal-method-input" style={{ textAlign: 'center', padding: '1.2rem', border: 'none' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0a0a0a' }}>
                    {formatSats(selectedSats)}
                  </div>
                </div>

                {cashuError && (
                  <div className="error-msg">
                    <div className="dot" />
                    <span>{cashuError}</span>
                  </div>
                )}

                <div className="tollgate-captive-portal-method-input">
                  <input
                    type="text"
                    placeholder="cashuxyz…"
                    autoComplete="off"
                    value={cashuToken}
                    onInput={(e) => handleCashuInput((e.target as HTMLInputElement).value)}
                  />
                  <div className="tollgate-captive-portal-method-input-actions">
                    {cashuToken && (
                      <button className="cancel" onClick={() => { setCashuToken(''); setCashuError(''); setCashuValidation(null); }}>✕</button>
                    )}
                    {!cashuToken && (
                      <button className="ghost" onClick={handleCashuPaste}>Paste</button>
                    )}
                    <button className="ghost">QR</button>
                  </div>
                </div>

                {isCashuValid && cashuValidation?.amount != null && (
                  <div
                    className="cashu-success-msg"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      margin: '0.5rem 0',
                      padding: '0.7rem 0.9rem',
                      background: '#e8f9ed',
                      border: '1px solid #32d74b',
                      borderRadius: 'var(--border-radius, 12px)',
                      color: '#1a7a36',
                      fontSize: 'var(--font-size-small, 0.9rem)',
                      fontWeight: 600,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      Valid Cashu token — {formatSats(cashuValidation.amount)}
                    </span>
                  </div>
                )}

                {pricing?.mintUrl && (
                  <p style={{ fontSize: 'var(--font-size-xsmall)', color: 'rgba(0,0,0,0.35)', textAlign: 'center' }}>
                    Accepted mint: {pricing.mintUrl}
                  </p>
                )}

                <div className="tollgate-captive-portal-method-submit" style={{ marginTop: '1.5rem' }}>
                  <button disabled={!isCashuValid || cashuPaying} onClick={handleCashuPay}>
                    {cashuPaying ? 'Processing…' : 'Continue'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {footer}
    </div>
  );
}
