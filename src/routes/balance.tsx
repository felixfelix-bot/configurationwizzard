import { useState, useEffect, useCallback } from 'preact/hooks';
import ParticleBg from '../components/particle-bg';
import PwaInstallModal from '../components/pwa-install-modal';
import { fetchSessionBalance, fetchWhoami, type BalanceResponse } from '../lib/payment-api';

const LOGO_SRC = './assets/logo/colour/net4sats-logo-colour.png';

const POLL_INTERVAL_MS = 5000;

// Default venue content shown when /net4sats/venue.html is unavailable (404)
const DEFAULT_VENUE_HTML = `
<div style="text-align:center;padding:1rem">
  <h3>Welcome!</h3>
  <p>Thanks for using net4sats.</p>
  <p><a href="https://net4sats.cash">Get your own device &rarr;</a></p>
  <p><a href="https://cashu.space">Learn about Cashu &rarr;</a></p>
</div>`;

type Phase = 'loading' | 'active' | 'no-session' | 'error';

/**
 * Format a quantity according to its metric.
 * milliseconds → min/hr, bytes → MB/GB
 */
function formatMetric(metric: string | undefined, value: number): string {
  if (value <= 0) return '0';
  if (metric === 'bytes') {
    const mb = value / 1048576;
    if (mb >= 1024) {
      const gb = mb / 1024;
      return gb >= 10 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  }
  // milliseconds
  const mins = value / 60000;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}min` : `${h} hour${h > 1 ? 's' : ''}`;
  }
  return `${Math.round(mins)} min`;
}

export default function BalancePage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [mac, setMac] = useState<string>('');
  const [venueHtml, setVenueHtml] = useState<string>(DEFAULT_VENUE_HTML);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchSessionBalance();
      setBalance(res);
      setLastUpdated(Date.now());
      if (res.session_active) {
        setPhase('active');
      } else {
        setPhase('no-session');
      }
    } catch (err) {
      setPhase('error');
    }
  }, []);

  // Initial load + polling every 5 seconds
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Fetch device MAC (best-effort, non-blocking)
  useEffect(() => {
    fetchWhoami()
      .then(setMac)
      .catch(() => {});
  }, []);

  // Fetch optional venue content (relative path; same dir as balance.html)
  useEffect(() => {
    fetch('venue.html')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((html) => {
        if (html && html.trim()) setVenueHtml(html);
      })
      .catch(() => {
        // 404 or fetch failure → keep default venue content
      });
  }, []);

  return (
    <>
      <ParticleBg />
      <PwaInstallModal />
      <div class="balance-page">
        {/* ── Header ─────────────────────────── */}
        <header class="balance-header">
          <img src={LOGO_SRC} alt="net4sats" />
          <span class="powered-by">Powered by TollGate</span>
        </header>

        {/* ── Loading ────────────────────────── */}
        {phase === 'loading' && (
          <div class="balance-loading">
            <div class="cp-spinner big" />
            <p>Checking your session…</p>
          </div>
        )}

        {/* ── Error ──────────────────────────── */}
        {phase === 'error' && (
          <div class="balance-card">
            <div class="balance-error">
              <p>Could not reach the payment gateway.</p>
              <button class="cta-btn" onClick={refresh}>
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ── No session ─────────────────────── */}
        {phase === 'no-session' && (
          <div class="balance-card">
            <div class="balance-no-session">
              <p>No active session found.</p>
              <a class="cta-btn" href={`http://${window.location.hostname}:2050/`}>
                Get Access
              </a>
            </div>
          </div>
        )}

        {/* ── Active session dashboard ───────── */}
        {phase === 'active' && balance && (
          <>
            <div class="balance-stats">
              <div class="stat-row status-row">
                <span class={`pulse-dot ${balance.session_active ? 'active' : ''}`} />
                <span class="status-label">
                  {balance.session_active ? 'Session active' : 'Session ended'}
                </span>
                {lastUpdated > 0 && (
                  <span class="updated">
                    Updated {new Date(lastUpdated).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div class="stat-hero">
                <span class="stat-hero-value">
                  {formatMetric(balance.metric, balance.remaining ?? 0)}
                </span>
                <span class="stat-hero-label">Remaining</span>
              </div>

              <div class="stat-grid">
                <div class="stat-cell">
                  <span class="stat-cell-value">
                    {formatMetric(balance.metric, balance.usage ?? 0)}
                  </span>
                  <span class="stat-cell-label">Used</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-cell-value">
                    {formatMetric(balance.metric, balance.allotment ?? 0)}
                  </span>
                  <span class="stat-cell-label">Total purchased</span>
                </div>
              </div>

              {/* Usage bar */}
              {balance.allotment && balance.allotment > 0 && (
                <div class="usage-bar-wrap">
                  <div
                    class="usage-bar-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (((balance.usage ?? 0) / balance.allotment) * 100),
                        ),
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Venue content ──────────────── */}
            <div
              class="balance-venue"
              dangerouslySetInnerHTML={{ __html: venueHtml }}
            />

            {/* ── External links ─────────────── */}
            <div class="balance-links">
              <a class="link-btn primary" href="https://net4sats.cash" target="_blank" rel="noopener noreferrer">
                Get your own device
              </a>
              <a class="link-btn ghost" href="https://cashu.space" target="_blank" rel="noopener noreferrer">
                Learn about Cashu
              </a>
            </div>
          </>
        )}

        {/* ── Footer ─────────────────────────── */}
        <footer class="balance-footer">
          {mac && <span>{mac}</span>}
          <span>net4sats v1.0</span>
        </footer>
      </div>
    </>
  );
}
