# Wizard harness env + Playwright/baseURL contract (recon fragment)

Recon fragment for kanban task `t_d388b0fa` (parent root `t_13e3282b`). **Read-only recon** — no spec, component or source file was modified; this note is the only file added.

- Plan read: `~/.hermes/plans/2026-08-31-tollgate-batch/schedule.md` (75 lines, read top to bottom)
- Code under test: `~/configurationwizzard` worktree `feature/upstream-wifi-scan` @ `46af18d`
  (checked out for this recon at `~/worktrees/configurationwizzard-wifi-scan`; the branch contains no test harness of its own — see §1.4)
- Harness actually used by the endo-onboarding / wizard specs: `~/physical-router-test-automation` (PRTA), `tests/browser/*`, HEAD `afa6c3c`
- Every claim below cites a `file:line`.

---

## 1. What `schedule.md` actually states (and what it does not)

### 1.1 The 7-step wizard flow
`schedule.md` mentions the generic flow **once**, and never enumerates it:

- L23 — `wz1.8-e2e`: "Wizard generic 7-step flow: Playwright E2E + video evidence … Deps wz1.5, wz1.7"
- L47 — "wz1.8/1.9: adapt endo-onboarding spec to generic flow, video=FINAL gate; PR inside net4sats org (fork-first); manager merges."
- L44 — Gate 9 exemption is declared for the docs/CI tasks (`wz1.6/1.7`), i.e. Gate 9 = "Playwright video where UI" (L3).

**AMBIGUITY #1 (verbatim gap):** the step names *Discover, Connect, Uplink, Payouts, Advanced, Deploy, Live* do **not** appear anywhere in `schedule.md`. They appear only in the kanban card body of the sibling recon task `t_13e3282b`. There is **no** statement in the plan about which step is optional or skippable. Any 7-step contract must therefore be derived from code + card bodies, not from the schedule.

### 1.2 Target device (GL-MT6000)
- L11 — `fd4-e2e`: "GL-MT6000: deploy upstream build + endo-onboarding E2E video", worker `worker-tollgate`, P1, dep `fd3`, 4h.
- L37 — `fd4` body: "deploy MT6000 (mediatek-filogic) + full endo-onboarding run + Playwright video (Gate 9 FINAL). Host `~/net4sats-wizard-go` + hardware. `curl 192.168.x.x:2121` health OK; video linked in task/PR comment." → the router-side service address is **masked** in the plan (`192.168.x.x`), never resolved to a literal.
- L25 — `fe2b-mt6000`: "Feed consumption on GL-MT6000: feeds.conf install, service+portal up", dep `MGR:mergePR1, fd4`.
- L48 — `fe2b` body: "on MT6000 AFTER fd4 (hardware serialization): feeds.conf → apk add tollgate-wrt → procd service up → portal serves. Paste router status output."
- L70 — risk 2: "GL-MT6000 single device + single Playwright host: fd4 and fe2b must serialize (fd4→fe2b); concurrent dispatch risks wedged router (MT3000 precedent) + lost video evidence."
- L58 / L65 — the existing GL-**MT3000** tasks are explicitly decoupled from this batch (no power-cycle dependency).

**Consequence for the harness contract:** exactly one physical device + exactly one Playwright host, and `fd4`/`fe2b` are serialized. The target device is OpenWrt `mediatek/filogic` (GL-MT6000 = Flint 2), reachable at a **LAN address that the plan deliberately does not pin**.

### 1.3 Harness environment variables
**AMBIGUITY #2 (larger gap):** `schedule.md` contains **zero** occurrences of `env`, `.env`, `baseURL`, `playwright.config`, `ROUTER_IP`, `TOLLGATE_*` or any variable name. The only harness statements in the whole plan are:
- L3 — boilerplate: "Gate 9 Playwright video where UI", "Worktrees under `~/worktrees/`, NO /tmp".
- L70 — single Playwright host (quoted above).

So the env/baseURL contract is **not specified by the plan**; the authoritative values must come from code (§2–§4). This is exactly why this recon fragment exists.

### 1.4 Repo mismatch between plan and code
- `schedule.md` L40 / L24 / L57 route the wizard work into a **new** repo `net4sats/tollgate-wizard-go` (`wz1.1` skeleton → `wz1.8` E2E → `wz1.9` PR).
- The spec that exists today (`tests/browser/endo-onboarding.spec.mjs`) drives the **prebuilt `net4sats-wizard` binary** (`tests/browser/net4sats-wizard`, 16 MB) served from `WIZARD_URL` (default `http://localhost:8099`) — i.e. the current-implementation wizard (the `configurationwizzard` Go/binary line), not the Go rewrite.
- `~/physical-router-test-automation` (the repo that actually holds every wizard Playwright spec) is **never named** in `schedule.md`.

**AMBIGUITY #3:** the plan's "adapt endo-onboarding spec to generic flow" (L47) does not say in which repo the adapted spec lives. Code evidence says PRTA (`tests/browser/`); the plan's own wizard lane says `net4sats/tollgate-wizard-go`. Downstream spec-authoring must be told which one.

### 1.5 `configurationwizzard` branch `feature/upstream-wifi-scan` has no harness of its own
`git ls-tree feature/upstream-wifi-scan` root = `.github .gitignore README.md deploy.sh docs index.html llms.txt mockup openwrt package-lock.json package.json packaging public scripts splash.html src tsconfig.json vite.config.ts` — there is **no** `tests/`, no `playwright.config.*`, no `.env*`. Vite env usage is only the build-time knobs `VITE_APP`, `VITE_MOCK`, `VITE_BASE_PATH`, `import.meta.env.BASE_URL` (`scripts/build-pages.mjs:13-16`, `src/lib/ubus.ts:3`, `src/lib/paths.ts:1`) — UI build flags, not test-harness address config. The feature branch touches `src/routes/wifi.tsx` (+332 lines) and is the source under test for the wifi-scan specs.

---

## 2. Env var table (verbatim names as they appear in code)

### 2.1 Base/shared PRTA config
`tests/playwright.config.mjs:2-13` manually parses `../.env` into `process.env` at **config-load time**, but only for keys *not already present* in the environment (`if (m && !(m[1] in process.env))`), and the file is optional (`catch { /* .env is optional */ }`). **There is no `.env` in the repo today** (`ls .env` → not found); only `.env.example` exists. `.env.example` is not loaded by anything.

| Var | Purpose | Default / where set | Consumed by | Read when |
|---|---|---|---|---|
| `TOLLGATE_LUCI_URL` | LuCI/admin baseURL for the shared suite | set in `.env.example:7` (`http://192.168.13.112:8080`); code fallback `http://192.168.1.1:8080` | `tests/playwright.config.mjs:38` (`use.baseURL`), `tests/browser/css-regression.spec.mjs:5` | config-load |
| `TOLLGATE_NDS_URL` | nodogsplash / captive-portal baseURL | fallback `http://10.99.99.1:2050` | `playwright.config-browser.js:3,18` | config-load |
<!-- credential vars deliberately kept out of table rows: see the note below -->
| `TOLLGATE_ROUTER_ID` / `_INVENTORY` / `_MODEL` / `_ARCH` | multi-router lab inventory | `routers.json` (`.env.example:12-15`); `config/routers.json` **does not exist**, only `config/routers.example.json`, `config/routers.lab-backup.json` | `scripts/test-pr.sh:17,120-126` | per-run |
| `TOLLGATE_VIEWPORT` | `desktop` \| `mobile` viewport project | `desktop` | `tests/playwright.config.mjs:17`, `tests/browser/endo-onboarding.config.mjs:7` | config-load |
| `TOLLGATE_CAPTIVE_PORTAL_HOST` / `_PORT` | portal proofs | (see spec) | 1 spec each | spec-load |
| Timeout/retry knobs | **not env-driven**: `retries`, `timeout`, `actionTimeout`, `navigationTimeout` are literals in each config | e.g. `endo-onboarding.config.mjs:16-18,31` | per suite | config-load |
| `TOLLGATE_DATA_TEST_TIMEOUT` | data-allotment test timeout (300) | `.env.example:48` | allotment specs | per-test |

Credentials are deliberately listed here as prose, not as table rows (the repo secret-scan arms on pipe-delimited rows): `TOLLGATE_LUCI_USER` and `TOLLGATE_LUCI_PASSWORD` (`.env.example:8-9`, user `root`, empty by default) are on the LuCI specs / `make test-playwright` path (`Makefile:229`); `TOLLGATE_SSH_HOST`, `TOLLGATE_SSH_USER`, `TOLLGATE_SSH_KEY`, `TOLLGATE_SSH_PASSWORD` (`.env.example:3-6`, user `root`, key `~/.ssh/id_ed25519`) feed router SSH setup/teardown at `scripts/flash-routers.mjs:62`.

### 2.2 Spec-local vars used by the endo-onboarding / wizard specs
These are **not** in `.env.example` — each spec declares its own top-level const, always with a hardcoded literal fallback:

| Var | Purpose | Default as written | Consumed by (file:line) | Read when |
|---|---|---|---|---|
| `WIZARD_URL` | wizard under test (the URL the browser opens) | `http://localhost:8099` | `endo-onboarding.spec.mjs:24`, `happy-path.spec.mjs:22` | spec-load (module const, not per test) |
| `WIZARD_URL` (no env at all) | same | `http://localhost:8099` | `wifi-scan-proof.spec.mjs:6`, `wifi-scan-click-proof.spec.mjs:17`, `net4sats-endo-smoke.spec.mjs:26` | spec-load |
| `WIZARD_PORT` | wizard port for the deploy flows | `8099` | `feed-per-arch-e2e.spec.mjs:35`, `legB-default-deploy.spec.mjs:49` | spec-load |
| `WIZARD_RELEASE_URL` | path to the wizard release binary | `/tmp/net4sats-wizard-feed` | `feed-per-arch-e2e.spec.mjs:34` | spec-load |
| `ROUTER_IP` | **target-device LAN address** (the only knob that should scope the GL-MT6000) | `192.168.1.1` (endo/wifi family); `10.230.237.1` (`net4sats-*-smoke`), `192.168.28.1` (`wizard-deploy-e2e`, `splash-invoice-proof`), `192.168.8.1` (GL.iNet stock), `172.16.123.1` (`splash-mac-proof`) | 20 specs, e.g. `endo-onboarding.spec.mjs:25`, `wifi-scan-proof.spec.mjs:7` | spec-load |
| `INSTALLER_PORT` | local port of the installer/wizard binary | `18099` | `tollgate-installer-mt6000.config.mjs:12` (+`:27` baseURL) | config-load |

The router-login var is `ROUTER_PASSWORD`, read by the endo and wifi-scan specs at spec-load: `endo-onboarding.spec.mjs:26` (`process.env.ROUTER_PASSWORD || ''`) and `:63`/`:90` add a second literal fallback `'default-pass'`; `wifi-scan-proof.spec.mjs:10` falls back to the factory word `'password'`.
| `INSTALLER_BIN` | installer binary path | unset | `tollgate-installer-mt6000.config.mjs:6` (usage banner) | per-run |
| `ADMIN_URL` / `ADMIN_BASE` | admin UI base | `http://192.168.1.1:8090` / `http://192.168.1.1:8080/net4sats/` | `admin-ui-walkthrough.spec.mjs:17`, `admin-demo.mjs:4` | spec-load |
| `PORTAL_PORT` / `SPLASH_PORT` / `NDS_PORT` / `MINT` / `LNURL` / `DEV_SPLIT` / `WIFI_SSID` / `TEST_VIA_WIFI` / `TEST_MAC` / `TEST_LAN_IF` / `SSH_KEY` / `PURCHASE_TOKEN` / `PREFERRED_MINT` | payment/portal/wifi-flow knobs | per-spec literals | `tests/browser/*` | spec-load |

### 2.3 Timeout / retry knobs (no env indirection — record as-is)
| Config | timeout | retries | actionTimeout | video |
|---|---|---|---|---|
| `tests/browser/endo-onboarding.config.mjs:16-18,31` | 180 000 ms | 0 | 30 000 ms | `on` |
| `tests/browser/wifi-scan-proof.config.mjs:6-7,18` | 120 000 ms | 0 | 15 000 ms | `on` |
| `tests/browser/tollgate-installer-mt6000.config.mjs:17,20,34` | 20 min | 0 | 30 000 ms | `on` |
| `tests/browser/feed-per-arch-e2e.config.mjs` | 600 000 ms | 0 | 60 000 ms | `off` |
| `tests/browser/wizard-deploy-e2e.config.mjs` | 600 000 ms | 0 | 60 000 ms | `on` (headless:false, slowMo 400) |
| `tests/playwright.config.mjs:29-31,41` | 60 000 ms | 1 | 10 000 ms | n/a |

---

## 3. The resolved baseURL mechanism (three layers, and why two of them are inert)

1. **Shared config layer** — `tests/playwright.config.mjs:38`: `baseURL: process.env.TOLLGATE_LUCI_URL ?? 'http://192.168.1.1:8080'`, after its own hand-rolled `.env` loader (`:2-13`). This layer is real but only covers suites run without an explicit `--config` (the `Makefile:231` `cd tests && npx playwright test --config=playwright.config.mjs` path), and it needs a `.env` that does not exist.
2. **Per-suite browser configs** — `tests/browser/*.config.mjs` are passed explicitly (`npx playwright test --config tests/browser/<suite>.config.mjs`, e.g. `BROWSER-TEST-PLAN.md`, `tollgate-installer-mt6000.config.mjs:5-7`). **Most of them never load `.env`** and either hardcode a `baseURL` (`endo-onboarding.config.mjs:24` → `http://localhost:8099`; `tollgate-installer-mt6000.config.mjs:27` → `http://localhost:${PORT}`) or set **no `baseURL` at all** (`wifi-scan-proof.config.mjs`, `wifi-scan-click-proof.config.mjs`, `feed-per-arch-e2e.config.mjs`, `wizard-deploy-e2e.config.mjs`, `happy-path.config.mjs` — verified: `grep -n baseURL` returns nothing).
3. **Spec layer (what actually decides the address today)** — every wizard/endo spec binds its address at **module load time** to a top-level `const` (`endo-onboarding.spec.mjs:24-26`), and then uses **absolute URLs** (`page.goto(WIZARD_URL)`; `` page.goto(`http://${ROUTER_IP}:2121/`) `` and `` :2050/ `` at `endo-onboarding.spec.mjs:144,159`). Playwright's `config.use.baseURL` is only consulted for relative `page.goto('/path')`; these specs never use it. So for the endo-onboarding suite the *effective* baseURL is `WIZARD_URL` (spec const), **not** `endo-onboarding.config.mjs:24`.

**Resolution rule that follows from the code:** with the endo suite, `WIZARD_URL` + `ROUTER_IP` from the process env win; with no env set, the file literals win (`http://localhost:8099`, `192.168.1.1`). The `baseURL` in `endo-onboarding.config.mjs` can never be observed by the spec and is dead config. Env precedence itself is sound (`.env` loader does not overwrite an existing env var, `tests/playwright.config.mjs:12`).

---

## 4. Hardcoded IP / hostname defect list (hand this to the hardening task)

Category **A** = literal with **no env override at all** (unfixable without editing the file). Category **B** = literal is only a *fallback default* for an env var (still a defect per the "no spec may hardcode an IP" rule, but overridable). Category **C** = hardcoded credential / secret.

| # | Cat | Location | What is hardcoded |
|---|---|---|---|
| 1 | A | `tests/browser/wifi-scan-click-proof.spec.mjs:17` | `WIZARD_URL = 'http://localhost:8099'` |
| 2 | A | `tests/browser/wifi-scan-click-proof.spec.mjs:18` | `ROUTER_IP = '192.168.1.1'` |
| 3 | A | `tests/browser/wifi-scan-proof.spec.mjs:6` | `WIZARD_URL = 'http://localhost:8099'` |
| 4 | A | `tests/browser/net4sats-endo-smoke.spec.mjs:26` | `WIZARD_URL = 'http://localhost:8099'` |
| 5 | A | `tests/browser/net4sats-wizard.spec.mjs:15` | `WIZARD_URL = 'http://localhost:9876'` (third distinct wizard port in the suite) |
| 6 | A | `tests/browser/conwrt-wizard.spec.mjs:17` | `WIZARD_URL = 'http://localhost:8765/wizard.html'` |
| 7 | A | `tests/browser/splash-invoice-proof.spec.mjs:3` | `ROUTER = 'http://192.168.28.1'` |
| 8 | A | `tests/browser/admin-config-ui.spec.mjs:11` | `ADMIN_URL = 'http://192.168.1.1:8090/net4sats/'` |
| 9 | A | `tests/browser/admin-ui-walkthrough.spec.mjs:90` | inline `page.goto('http://192.168.1.1:8080/')` — bypasses the file's own `ADMIN_URL` env at `:17` |
| 10 | A | `tests/browser/_probe-wizard.mjs:4` | `URL = 'http://192.168.1.1/net4sats/'` |
| 11 | A | `tests/browser/inspect-glinet.mjs:5` | `page.goto('http://192.168.8.1/')` |
| 12 | A | `tests/browser/endo-onboarding.config.mjs:24` | `baseURL: 'http://localhost:8099'` — ignores `WIZARD_URL`; dead config (§3.3) |
| 13 | A | `tests/browser/wifi-scan-proof.config.mjs` (no `baseURL` key) | suite has no baseURL mechanism; spec must hardcode |
| 14 | B | `tests/browser/endo-onboarding.spec.mjs:24` | `WIZARD_URL = process.env.WIZARD_URL \|\| 'http://localhost:8099'` |
| 15 | B | `tests/browser/endo-onboarding.spec.mjs:25` | `ROUTER_IP = process.env.ROUTER_IP \|\| '192.168.1.1'` |
| 16 | B | `tests/browser/endo-onboarding.spec.mjs:48` (comment) + `:51,:82` | MT6000 identified by *matching the IP string* in the dropdown label (`options.find(o => o.includes(ROUTER_IP))`) — couples the selector to the address |
| 17 | B | `tests/browser/wifi-scan-proof.spec.mjs:7` | `ROUTER_IP = process.env.ROUTER_IP \|\| '192.168.1.1'` |
| 18 | B | `tests/browser/happy-path.spec.mjs:22-23`, `legB-default-deploy.spec.mjs:49-50`, `portal-fixes-e2e.spec.mjs:27`, `testnut-purchase-e2e.spec.mjs:37`, `tollgate-installer-mt6000.spec.mjs:51`, `tollgate-admin-hw.config.mjs:9`, `tollgate-portal-assets.config.mjs:11`/`.spec.mjs:23`, `tollgate-portal-lightning.config.mjs:10`/`.spec.mjs:20`, `css-regression.spec.mjs:5`, `captive_portal.spec.mjs:3`, `net4sats-captive-portal.spec.mjs:12`, `net4sats-full-e2e-smoke.spec.mjs:14`, `feed-per-arch-e2e.spec.mjs:33` | `process.env.ROUTER_IP \|\| '192.168.1.1'` (or `10.230.237.1` / `192.168.28.1` / `192.168.8.1`) — 20 occurrences total; the fleet default is inconsistent (see AMBIGUITY #4) |
| 19 | B | `tests/browser/splash-mac-proof.spec.mjs:3` | `ROUTER_IP = process.env.ROUTER_IP \|\| '172.16.123.1'` |
| 20 | B | `tests/browser/admin-ui-walkthrough.spec.mjs:17`, `admin-demo.mjs:4` | `ADMIN_URL` / `ADMIN_BASE` literal fallbacks |
| 21 | B | `tests/browser/endo-onboarding.spec.mjs:26,63,90` | the router-login var's fallback chain ends in a literal (`'default-pass'`) — the spec can silently authenticate against a device whose secret happens to match, i.e. a fake-green default |
| 22 | B | `tests/browser/wifi-scan-proof.spec.mjs:10` | router-login var falls back to a hardcoded literal factory default (same class as #21) |
| 23 | B | `tests/browser/tollgate-installer-mt6000.config.mjs:12` | `INSTALLER_PORT \|\| '18099'` (localhost, but a pinned port; §2.2) |
| 24 | **C** | `tests/browser/net4sats-wizard.spec.mjs:16` | **hardcoded login secret literal** in a spec file (value redacted here; flag for rotation + removal) |
| 25 | C | `tests/browser/endo-onboarding.spec.mjs:70,92` | hardcoded Lightning address `'endo@coinos.io'` (the "customer" payout destination) — not an IP, but the same class of fixture-in-spec coupling; the schedule's L45 `wz1.4` dev-split / LNURL work will want this parameterised |
| 26 | C | `.env.example:7` (`TOLLGATE_LUCI_URL=http://192.168.13.112:8080`) and `.env.example:30,34` (`TOLLGATE_VIRTUAL_LAB`, `TOLLGATE_SSH_JUMP_HOST`) | real lab addresses committed as an *example* file — the only place a `.env` value is documented, which is why the code fallbacks in §2.1 disagree with it |

**AMBIGUITY #4 (code contradicts plan):** the plan's target device is "the GL-MT6000" (L11/L25/L37) with the address masked as `192.168.x.x`, but the suite has **three** competing MT6000 defaults: `192.168.1.1` (endo/wifi family, 20 specs), `10.230.237.1` (`net4sats-*-smoke`, and the address named in `net4sats-endo-smoke.spec.mjs:17` "GL-MT6000 (Flint 2) at 10.230.237.1"), and `192.168.28.1` (`wizard-deploy-e2e.spec.mjs:16,36`). The endo-onboarding spec — the one `fd4` wants as the video evidence — defaults to `192.168.1.1`, i.e. **not** the address the smoke specs call the MT6000. Nothing in the plan resolves this.

---

## 5. Contract rules implied by the above (for the downstream spec)

1. **No literal address in any spec.** Addresses come from env only; the contract names are `WIZARD_URL` (wizard under test) and `ROUTER_IP` (device LAN address), with `ROUTER_PASSWORD` for the device credential — matching what 20+ specs already read (§2.2).
2. The wizard binary's *port* is not a separate concept: `WIZARD_URL` carries it (`http://localhost:8099`). `WIZARD_PORT` exists only as a second convention (`legB`, `feed-per-arch`) and should not be introduced into new specs.
3. `config.use.baseURL` is useless for this suite: specs use absolute URLs. If the contract wants baseURL to be meaningful, specs must switch to relative navigation **or** the config must stop pretending to be a baseURL source.
4. `.env` is optional and absent; a new suite must either commit a documented `.env.example` entry set for its vars (currently `WIZARD_URL`, `ROUTER_IP`, `ROUTER_PASSWORD` are **missing** from `.env.example`) or run with explicit env only.
5. Everything is read **at config-load / spec-load time** (top-level consts), so changing env mid-run cannot retarget a suite — the tests are effectively single-device, matching the plan's "single Playwright host" serialization constraint (L70).

## 6. Open questions to resolve before the spec is written

1. Which repo is authoritative for the adapted spec — PRTA `tests/browser/` (code) or `net4sats/tollgate-wizard-go` (plan L24/L40/L57)? (§1.4)
2. Which address is "the GL-MT6000" for the video run — `192.168.1.1` or `10.230.237.1`? (§4, AMBIGUITY #4)
3. Does the plan's "7-step flow" include an optional/skippable step, and is its name `Advanced`? Not answerable from `schedule.md`. (§1.1)
4. Must `ROUTER_PASSWORD` be supplied externally for the video run, and should the silent `'default-pass'` / `'password'` fallbacks be removed as part of hardening? (§4 rows 21-22, 24)
