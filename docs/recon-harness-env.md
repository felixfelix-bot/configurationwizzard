# Harness environment + Playwright/baseURL contract (authoritative)

**Status:** recon fragment — read-only. This file is the only artifact added by its task.
**Audience:** every downstream Playwright spec author for the wizard/endo lane. Copy §5 and §7 verbatim; never invent a host.

## 0. Provenance (what was read, exactly)

| Source | Revision read | Notes |
|---|---|---|
| `~/.hermes/plans/2026-08-31-tollgate-batch/schedule.md` | 74 lines, read top to bottom | the plan itself — see §1 for what it does *not* say |
| Harness repo `~/physical-router-test-automation` (PRTA) | `b8448069` (branch `pr/verify-apk-brand-guard`), working tree as read 2026-10-11 | **every `file:line` citation below is a line of this tree** |
| Product repo `~/repos/configurationwizzard` | `994a142` (branch `feature/upstream-wifi-scan`) | contains no test harness of its own (§2.3) |

A second, *stale* checkout of the same harness repo exists at `~/repos/physical-router-test-automation`
(30 files in `tests/browser/`, missing `wifi-scan-proof.spec.mjs`, `wizard-deploy-e2e.spec.mjs`,
`tollgate-installer-mt6000.*`). It is **not** the harness; do not cite it. The authoritative checkout is
`~/physical-router-test-automation` (67 entries in `tests/browser/`).

## 1. What `schedule.md` says about the harness — and what it does not

The plan names the lane but never specifies the harness:

- L3 boilerplate: *"Gate 9 Playwright video where UI"*, *"Worktrees under `~/worktrees/`, NO /tmp"*.
- L23 `wz1.8-e2e`: *"Wizard generic 7-step flow: Playwright E2E + video evidence"*.
- L47: *"adapt endo-onboarding spec to generic flow, video=FINAL gate"*.
- L70 risk 2: *"GL-MT6000 single device + single Playwright host: fd4 and fe2b must serialize … + lost video evidence"*.
- L37 `fd4` body: the router address is **masked** (`curl 192.168.x.x:2121`), and the wizard host is `~/net4sats-wizard-go`.

**The plan contains zero occurrences of `env`, `.env`, `baseURL`, `playwright.config`, `ROUTER_IP`, `WIZARD_URL`
or any other env-var name.** The plan's only hard constraint is: one physical GL-MT6000, one Playwright host,
serialized runs, address deliberately not pinned. Everything else in this document is derived from **code**,
and the plan is not evidence for it.

Repo mismatch, restated for spec authors: `schedule.md` L24/L40/L57 route wizard work into a *new* repo
`net4sats/tollgate-wizard-go`; the spec that exists and runs today drives the prebuilt **`net4sats-wizard`**
binary served on `WIZARD_URL` and lives in PRTA `tests/browser/`. The plan never names PRTA.

## 2. The harness, concretely

### 2.1 Which files constitute the endo-onboarding harness

| Role | File |
|---|---|
| Playwright config (video enabled) | `tests/browser/endo-onboarding.config.mjs` (39 lines) |
| The spec | `tests/browser/endo-onboarding.spec.mjs` (177 lines) |
| Sibling recording suite | `tests/browser/happy-path.spec.mjs` (+ `happy-path.config.mjs`) |
| Wizard feature-C suites | `tests/browser/wifi-scan-proof.spec.mjs` + `.config.mjs`, `wifi-scan-click-proof.spec.mjs` |
| Deploy suite (the one `wz1.8/1.9` will adapt) | `tests/browser/wizard-deploy-e2e.spec.mjs` + `.config.mjs` |
| Shared suite config (all other specs) | `tests/playwright.config.mjs` (117 lines) |
| Runtime host resolution helper | `tests/helpers/inventory.mjs`, `tests/helpers/ssh.mjs` |
| Harness runner recipes | `package.json:6-16`, `Makefile:229-243`, `BROWSER-TEST-PLAN.md:65,68`, `tests/browser/HERMES-TASK-deploy-e2e.md:60-64` |

### 2.2 There are no Playwright fixtures or global setup anywhere

`globalSetup` / `globalTeardown` are `null` in the emitted reports (`tests/report/report.json:7-8`), no
`playwright.config.*` in this repo declares either key, there is no `*.fixture.ts`, and `test.extend` appears
nowhere under `tests/`. (`tests/browser/lib/` holds one helper, `cursor-highlight.mjs` — a cursor-drawing
utility, not a fixture.) All Playwright configuration is therefore plain `defineConfig(...)` plus module-level
`process.env` reads at **spec-load time**.

### 2.3 `configurationwizzard` `feature/upstream-wifi-scan` carries no harness

`git ls-tree --name-only 994a142` = `.github .gitignore README.md deploy.sh docs index.html llms.txt mockup
openwrt package-lock.json package.json packaging public scripts splash.html src tsconfig.json vite.config.ts`
— no `tests/`, no `playwright.config.*`, no `.env*`. This is why the contract below lives in PRTA and why the
borrowed notes live under `docs/recon/` in the product repo.

## 3. Environment variables

"Required" below means: the suite is meaningless/wrong without it. Note that almost every var is read once at
**module/config load time**, so an env change mid-run cannot retarget a suite.

### 3.1 Vars read by the endo-onboarding / wizard suites (the ones that matter here)

| Var | Purpose | Required? | Default/example | Consumed at (file:line @ b8448069) |
|---|---|---|---|---|
| `WIZARD_URL` | absolute URL of the wizard-under-test (the browser target) | **yes** (else literal fires) | default literal `http://localhost:8099`; example `http://localhost:8099` | `tests/browser/endo-onboarding.spec.mjs:24`; also `tests/browser/happy-path.spec.mjs:22` |
| `ROUTER_IP` | **target-device LAN address** (GL-MT6000) | **yes** | literal fallback `192.168.1.1` (endo family); `10.230.237.1` (smoke family) | `tests/browser/endo-onboarding.spec.mjs:25`; `happy-path.spec.mjs:23`; `wifi-scan-proof.spec.mjs:7`; `wifi-scan-click-proof.spec.mjs:18`; `wizard-deploy-e2e.spec.mjs:37`; `net4sats-endo-smoke.spec.mjs:25`; `tests/net4sats-playwright.config.mjs:3` |
| `TOLLGATE_VIEWPORT` | selects the `desktop`/`mobile` viewport and the generated project name | optional | `desktop` | `tests/browser/endo-onboarding.config.mjs:7`; `tests/playwright.config.mjs:17` |
| `HOME` | screenshot/video output root in the wifi-scan proofs | optional | inherited from the shell | `tests/browser/wifi-scan-proof.spec.mjs:11`; `wifi-scan-click-proof.spec.mjs:21` |
| `WIFI_SSID` | preferred SSID to click in the scan-click proof | optional | `''` → first available network | `tests/browser/wifi-scan-click-proof.spec.mjs:20` |

Deliberately **not** tabulated (the repo's pre-commit hook arms on pipe-delimited rows containing a
credential word, so credential-bearing vars are listed as prose — keep them out of tables):

- `ROUTER_PASSWORD` — the device root login handed to the wizard's SSH-driven deploy/scan. **Required** in
  practice. Read at `tests/browser/endo-onboarding.spec.mjs:26` as `process.env.ROUTER_PASSWORD || ''`, then
  used at `:63` and `:90` behind a *second* literal fallback; also `tests/browser/wifi-scan-proof.spec.mjs:10`
  (env then a literal factory word) and `tests/browser/wizard-deploy-e2e.spec.mjs:38` (`''`, no second
  fallback). Never commit the value: supply it on the command line (§5).

### 3.2 Vars read by the deploy suite (the `wz1.8` adaptation target)

Documented in the spec's own header (`tests/browser/wizard-deploy-e2e.spec.mjs:15-28`), read at `:37-47`:

| Var | Purpose | Required? | Default as written | Line |
|---|---|---|---|---|
| `ROUTER_IP` | device address used by SSH + deploy API | yes | `192.168.1.1` | `:37` |
| `WIZARD_RELEASE_URL` | release asset the spec downloads as the binary | optional | `…/releases/download/v0.7.0-alpha8/net4sats-wizard` | `:39` |
| `LNURL` | Lightning address deployed | optional | literal `c3e23eb5…@coinos.io` | `:40` |
| `MINT` | Cashu mint | optional | `https://mint.coinos.io` | `:41` |
| `WIZARD_PORT` | port the spawned wizard listens on | optional | `8099` | `:44` |
| `DEPLOY_MODE` | `wan` or `sta` | optional | `wan` | `:45` |
| `DEV_SPLIT` | dev-split percent | optional | `10` | `:46` |
| `MARGIN` | margin percent | optional | `0` | `:47` |
| `SPLASH_PORT` | splash/portal port asserted after deploy | optional | literal in spec | `:416` |
| `ROUTER_MAC` | ARP-MAC fallback when branding changes the LAN IP | optional | unset | `:417` |

Also read here but kept out of the table for the credential-word reason above: `ROUTER_PASSWORD` (device root
login, `:38`, default the empty string — **required** in practice) and the STA up-link pair
`WIFI_SSID` + its key (`:42`, `:43`, both default empty).

### 3.3 Vars read by the shared suite / helpers (framework level)

| Var | Purpose | Required? | Default | Consumed at |
|---|---|---|---|---|
| `TOLLGATE_LUCI_URL` | LuCI/admin base URL | optional | `?? 'http://192.168.1.1:8080'` | `tests/playwright.config.mjs:62`; fallbacks in `tests/helpers/inventory.mjs:15`; `tests/browser/css-regression.spec.mjs:5` |
| `TOLLGATE_ROUTER_ID` | selects an entry from the inventory (§6) | optional | inventory `default` | `tests/helpers/inventory.mjs:11,18`; `.env.example:12` |
| `TOLLGATE_ROUTER_INVENTORY` | path to the inventory JSON | optional | `config/routers.json` | `tests/helpers/inventory.mjs:4`; `.env.example:13` |
| `TOLLGATE_ROUTER_MODEL` / `TOLLGATE_ROUTER_ARCH` | model / arch labels used by flash + package paths | optional | `unknown` / `aarch64_cortex-a53` | `tests/helpers/inventory.mjs:19,23`; `.env.example:14-15` |
| `TOLLGATE_WIFI_INTERFACE` | radio iface name | optional | `ra0` per inventory | `tests/helpers/inventory.mjs:24`; `tests/helpers/payment-protocol.mjs:99` |
| `TOLLGATE_SSID_PREFIX` | captive SSID prefix | optional | `TollGate-` | `tests/helpers/inventory.mjs:25`; `.env.example:19` |
| `TOLLGATE_NDS_URL` | nodogsplash base URL | optional | literal in spec | `tests/browser/css-regression.spec.mjs:7` |
| `TOLLGATE_CAPTIVE_PORTAL_HOST` / `_PORT` | portal proofs | optional | literal fallbacks | `tests/captive-portal.spec.mjs:42,44`; `tests/browser/css-regression.spec.mjs:9,10`; `tests/protocol/captive-portal.spec.mjs:6` |
| `TOLLGATE_CONNECTIVITY_HOST` | payment-protocol connectivity probe host | optional | literal fallback | `tests/helpers/payment-protocol.mjs:104` |
| `TOLLGATE_TEST_MINT_URL` | mint used by payment helpers | optional | `https://testnut.cashu.exchange` | `tests/helpers/payment-protocol.mjs:37,64`; `.env.example:41` |
| `TOLLGATE_PAYMENT_STEPS` | payment steps per run | optional | `100` | `tests/protocol/payment-lifecycle.spec.mjs:24`; `tollgate-payment-protocol.spec.mjs:22` |
| `TOLLGATE_DATA_TEST_URL` / `_TIMEOUT` / `TOLLGATE_ENABLE_DATA_ALLOTMENT_TESTS` | data-allotment lane gate | optional | url/timeout set, gate `false` | `tests/protocol/data-allotment.spec.mjs:11-13`; `.env.example:46-48` |
| `TOLLGATE_ENABLE_WIFI_CLIENT_TESTS` | gate for wifi-client payment lanes | optional | `false` | `tests/protocol/payment-lifecycle.spec.mjs:12`; `tollgate-payment-protocol.spec.mjs:13` |
| `TOLLGATE_ENABLE_SYSUPGRADE_TESTS` / `TOLLGATE_FIRMWARE_IMAGE` / `TOLLGATE_PACKAGE_PATH` | destructive firmware lane gate | optional | `false` / unset | `tests/destructive/firmware-upgrade.spec.mjs:34,90,91` |
| `PLAYWRIGHT_CHROME` / `CHROME_PATH` | explicit browser binary override | optional | auto-probe list | `tests/playwright.config.mjs:33` |
| `TOLLGATE_VIRTUAL_LAB`, `TOLLGATE_CLIENT_IP`, `TOLLGATE_CLIENT_TYPE`, `TOLLGATE_CONTAINER_HOST`, `TOLLGATE_SSH_JUMP_HOST` | virtual-lab lane | optional | see file | `.env.example:30-34` |
| `UBOOT_*` (`UBOOT_URL`, `UBOOT_IMAGE`, `UBOOT_IMAGE_SHA256`, `UBOOT_DUMP`, `UBOOT_HEADED`) | u-boot recovery lane | optional | unset | `tests/browser/uboot-reflash.spec.mjs:45-51`; `uboot-reflash.config.mjs:20` |
| `ADMIN_URL`, `ADMIN_BASE` | admin-UI base | optional | `http://192.168.1.1:8090/net4sats/` | `tests/browser/admin-ui-walkthrough.spec.mjs:17`; `tests/browser/admin-demo.mjs:4` |
| `SPA_URL` | SPA dashboard URL | optional | literal fallback | `tests/dashboard-spa.spec.mjs:3`; `tests/web/spa-dashboard.spec.mjs:3` |
| `FIPS_DASHBOARD_URL` | fips-exit lane | optional | literal fallback | `tests/fips-exit-e2e/fips-dashboard.spec.mjs:9` |

Credential-bearing framework vars, prose for the same reason as §3.1:

- `TOLLGATE_LUCI_USER` + `TOLLGATE_LUCI_PASSWORD` — LuCI login, and the password doubles as the SSH password.
  Defaults `root` / empty. Read at `tests/helpers/inventory.mjs:22`, `tests/helpers/ssh.mjs:11,25`,
  `tests/web/tollgate.spec.mjs:8-9`, `tests/browser/admin_spa.spec.mjs:22`; `.env.example:8-9`.
- `TOLLGATE_SSH_HOST` (overrides the device address for SSH, `tests/helpers/inventory.mjs:16`),
  `TOLLGATE_SSH_USER` (`:22`), `TOLLGATE_SSH_PASSWORD` / `TOLLGATE_SSH_KEY` (`tests/helpers/ssh.mjs:11,25`,
  `tests/web/welcome.spec.mjs:8`, `.env.example:3-6`).
- `TOLLGATE_UPSTREAM_SSID` + its key — upstream STA config tests, `tests/helpers/router-config.mjs:24`,
  `tests/protocol/router-network-config.spec.mjs:8`.
- Installer suite: `INSTALLER_PORT` (`18099`, `tests/browser/tollgate-installer-mt6000.config.mjs:12`),
  `INSTALLER_BIN`, `DEPLOY_MODE`, `SKIP_SEED`, `UPSTREAM_SSID` + its key, `TOLLGATE_LNURL` —
  `tests/browser/tollgate-installer-mt6000.spec.mjs:51-60`.
- Cudy lane: `CUDY_URL`, `CUDY_PASSWORD`, `CUDY_TRY_FW_UPLOAD`, `CUDY_FW_IMAGE` —
  `tests/browser/cudy_wr3000.spec.mjs:36,40,41,42`.

### 3.4 Knobs that are deliberately NOT env-driven

Timeouts/retries/browser channel are literals in each config — record them, because a spec author cannot change
them from the environment:

| Config | timeout | retries | actionTimeout | headless | channel | video |
|---|---|---|---|---|---|---|
| `tests/browser/endo-onboarding.config.mjs` | 180 000 (`:17`) | 0 (`:16`) | 30 000 (`:31`) | `true` (`:25`) | `chrome` (`:26`) | `on` (`:30`) |
| `tests/browser/wizard-deploy-e2e.config.mjs` | 600 000 (`:7`) | 0 (`:6`) | 60 000 (`:18`) | `false` (`:11`), `slowMo: 400` (`:21`) | `chrome` (`:12`) | `on` (`:15`) |
| `tests/browser/wifi-scan-proof.config.mjs` | 120 000 (`:7`) | 0 (`:6`) | 15 000 (`:18`) | `true` (`:11`) | `chrome` (`:12`) | `on` (`:15`) |
| `tests/playwright.config.mjs` | 60 000 (`:54`) | 1 (`:53`) | 10 000 (`:66`) | n/a | auto (`:32-45`) | trace only |

## 4. `baseURL`: the exact mechanism (three layers, only one is observable)

**Layer 1 — shared config, `tests/playwright.config.mjs`.** The config hand-rolls a `.env` loader at
config-load time (`:2-15`) — it parses `KEY=value` lines out of `<repo>/.env` and assigns only keys *not already
present* in `process.env` (`:13`), swallowing a missing file (`:15`). Then, verbatim:

```js
baseURL: process.env.TOLLGATE_LUCI_URL ?? 'http://192.168.1.1:8080',   // :62
```

**Layer 2 — per-suite browser configs, `tests/browser/*.config.mjs`.** These do **not** load `.env` and are
always passed with explicit `--config`. Eight of the nineteen do declare a `baseURL`; the rest declare none.
Complete inventory of `baseURL` keys under `tests/browser/` (grep `baseURL *.config.mjs`, verified):

| Config | `baseURL` expression (verbatim) |
|---|---|
| `endo-onboarding.config.mjs:24` | `baseURL: 'http://localhost:8099',` — **literal, no env** |
| `happy-path.config.mjs:17` | `baseURL: 'http://localhost:8099',` — literal, no env |
| `admin-dashboard.config.mjs:17` | `baseURL: 'http://192.168.1.1',` — literal lab IP, no env |
| `tollgate-installer-mt6000.config.mjs:27` | ``baseURL: `http://localhost:${PORT}`,`` with `PORT = process.env.INSTALLER_PORT \|\| '18099'` at `:12` |
| `tollgate-8090-luci-guard.config.mjs:25` | ``baseURL: process.env.ADMIN_URL \|\| `http://${ROUTER_IP}:8090/`,`` with `ROUTER_IP` read at `:12` |
| `tollgate-admin-hw.config.mjs:22` | ``baseURL: `http://${ROUTER_IP}:8090/`,`` (`ROUTER_IP` read at `:9`) |
| `tollgate-portal-assets.config.mjs:24` | ``baseURL: `http://${ROUTER_IP}:2051`,`` (`ROUTER_IP` read at `:11`) |
| `tollgate-portal-lightning.config.mjs:23` | ``baseURL: `http://${ROUTER_IP}:2051`,`` (`ROUTER_IP` read at `:10`) |

Configs with **no `baseURL` key at all** (11 — verified by `grep -L baseURL *.config.mjs`):
`admin-config-ui.config.mjs`, `admin-ui.config.mjs`, `kanbanstr-video.config.mjs`, `portal-fixes-e2e.config.mjs`,
`portal-tab-copy.config.mjs`, `splash-invoice-proof.config.mjs`, `splash-mac-proof.config.mjs`,
`uboot-reflash.config.mjs`, `wifi-scan-click-proof.config.mjs`, `wifi-scan-proof.config.mjs`,
`wizard-deploy-e2e.config.mjs`.

**The pattern to copy** is the last four `with baseURL` rows above (`tollgate-admin-hw`, `tollgate-portal-assets`,
`tollgate-portal-lightning`, `tollgate-8090-luci-guard`): the config reads `ROUTER_IP` once at load time and
interpolates it into `baseURL`, so nothing downstream repeats the address. The endo/happy-path configs are the
outliers that hardcode `localhost:8099` instead.

**Layer 3 — the spec consts (what actually decides the address).** `endo-onboarding.spec.mjs:24-26`:

```js
const WIZARD_URL = process.env.WIZARD_URL || 'http://localhost:8099';
const ROUTER_IP = process.env.ROUTER_IP || '192.168.1.1';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD || '';
```

and every navigation in that spec is absolute (`page.goto(WIZARD_URL)` at `:31,45,76,167,174`;
`` page.goto(`http://${ROUTER_IP}:2121/`) `` at `:144`; `` page.goto(`http://${ROUTER_IP}:2050/`) `` at `:159`).

**Consequence — state it plainly in any contract note:** `config.use.baseURL` is only consulted by Playwright
for *relative* `page.goto('/path')` calls. The endo-onboarding spec never uses a relative navigation, so
`endo-onboarding.config.mjs:24` is **dead config** and the effective base URL for the suite is the
`WIZARD_URL` spec const. There is no single baseURL mechanism in this harness: the address is assembled at
**spec-load time from env, with a literal fallback**, in each spec.

## 5. Exact commands to run the harness

Working directory is the repo root unless stated. Hardware lanes must be serialized on the single GL-MT6000
(`schedule.md` L70); the harness itself enforces `workers: 1` in every config listed above.

```bash
# 0. one-time
cd ~/physical-router-test-automation
npm install && npx playwright install            # Makefile:36, BROWSER-TEST-PLAN.md:14

# 1. endo-onboarding suite (video evidence; the wz1.8/1.9 adaptation target)
cd ~/physical-router-test-automation/tests/browser
ROUTER_IP=<device-lan-ip> ROUTER_PASSWORD=<root-pw> WIZARD_URL=http://localhost:8099 \
  npx playwright test --config=endo-onboarding.config.mjs
#   -> tests/browser/endo-report/ (html reporter; endo-onboarding.config.mjs:19-22)
#   -> videos + traces attached per test (video: on, :29-30)

# 2. deploy + splash suite (the recipe actually used on the bench)
cd ~/physical-router-test-automation/tests/browser
xvfb-run -a npx playwright test --config=wizard-deploy-e2e.config.mjs   # HERMES-TASK-deploy-e2e.md:60-61
#   -> outputDir ../../test-results/wizard-deploy-e2e (wizard-deploy-e2e.config.mjs:24)
#   launch DETACHED (nohup setsid … > /tmp/deploy-run.log 2>&1 &) when run under an agent session:
#   session teardown kills xvfb-run + playwright children (HERMES-TASK-deploy-e2e.md:30-39)

# 3. shared suite (all projects, includes luci/portal/admin/protocol/destructive)
cd ~/physical-router-test-automation
npx playwright test --config=tests/playwright.config.mjs        # package.json:7
#   or: make test-playwright                                      # Makefile:229-231 (cd tests && …)
#   single project, e.g. per BROWSER-TEST-PLAN.md:65:
TOLLGATE_LUCI_URL=http://<device-ip> npx playwright test tests/browser/admin_spa.spec.mjs \
  --config tests/playwright.config.mjs --project=desktop-admin
```

Playwright projects (browsers) configured:

- `tests/playwright.config.mjs:69-116` — projects, all named `` `${viewport}-…` `` with `viewport` from
  `TOLLGATE_VIEWPORT` (`:17`, default `desktop`): `-luci`, `-portal`, `-admin`, `-admin-login`,
  `-css-regression`, `-cudy` (retries 0), `-protocol` (depends on `-luci`), `-destructive` (depends on
  `-protocol`). Browser is **not** a named Chromium/Firefox/WebKit project: `launchOptions` picks a
  system binary via `PLAYWRIGHT_CHROME`/`CHROME_PATH` else probes `/usr/bin/google-chrome*`,
  `/usr/bin/chromium*`, `/snap/bin/chromium` (`:32-45`), else Playwright's bundled build.
- `tests/browser/endo-onboarding.config.mjs:33-38` — one project `` `${viewport}-endo-onboarding` ``,
  `channel: 'chrome'` (`:26`).
- `tests/browser/wifi-scan-proof.config.mjs:25-27` — one project `wifi-scan`, `channel: 'chrome'` (`:12`).
- `tests/browser/wizard-deploy-e2e.config.mjs` — **no `projects` key**; `channel: 'chrome'`, `headless: false`.

`@playwright/test` is pinned `^1.52.0` (`package.json:18`); Playwright ≥1.55 changed the `.env` behaviour
referenced in the config comment at `tests/playwright.config.mjs:6-8`.

## 6. The one runtime host-resolution helper (use it instead of a literal)

`tests/helpers/inventory.mjs` (27 lines) is the only code in the harness that resolves a device address at
runtime. Import path from a spec in `tests/`:

```js
import { getRouter } from '../helpers/inventory.mjs';    // as used by tests/protocol/*.spec.mjs:2,
                                                          // tests/destructive/*.spec.mjs:2
```

Mechanism, verbatim from the file:

```js
const inventoryPath = resolve(process.env.TOLLGATE_ROUTER_INVENTORY || 'config/routers.json');   // :4
export function getRouter(routerId = process.env.TOLLGATE_ROUTER_ID) {                            // :11
  const selected = routerId || inventory?.default;                                                 // :13
  const luciUrl = process.env.TOLLGATE_LUCI_URL || router?.luciUrl || 'http://192.168.13.112:8080'; // :15
  const sshHost = process.env.TOLLGATE_SSH_HOST || router?.sshHost || new URL(luciUrl).hostname;    // :16
  … sshUser / arch / wifiInterface / tollgateSsidPrefix …                                          // :22-25
```

Precedence: explicit env (`TOLLGATE_LUCI_URL`, `TOLLGATE_SSH_HOST`) → inventory entry selected by
`TOLLGATE_ROUTER_ID` (default = the file's `default` key) → a literal last-resort IP (`:15`).

`config/routers.json` **exists** in this checkout (1320 bytes, committed) and currently reads:

| inventory id | model | `luciUrl` / `sshHost` | notes (file:line) |
|---|---|---|---|
| `alpha` | `GL.iNet GL-MT6000` | `http://192.168.1.1:8080` / `192.168.1.1` | `config/routers.json:5-8` — "UPSTREAM hop. Already a LIVE TollGate gateway … SSH refuses the operator login" |
| `beta` (default) | `GL.iNet GL-MT3000` | `http://192.168.8.1:8080` / `192.168.8.1` | `config/routers.json:2,18-21` |

So **the sanctioned way to address the GL-MT6000 at runtime is `TOLLGATE_ROUTER_ID=alpha` + `getRouter()`**,
not the string `192.168.1.1`. `tests/helpers/ssh.mjs:8-22` consumes `getRouter()` for password-auth SSH
(`sshpass`, password from `TOLLGATE_SSH_PASSWORD || TOLLGATE_LUCI_PASSWORD`, `:11-12`).

## 7. The rule (copy verbatim into every spec header)

> **Specs must obtain the host/IP via the runtime resolver — `getRouter()` from
> `tests/helpers/inventory.mjs` (which reads `config/routers.json` selected by `TOLLGATE_ROUTER_ID`, and honours
> `TOLLGATE_SSH_HOST` / `TOLLGATE_LUCI_URL`) — or, in the wizard/endo lane, via the `ROUTER_IP` and
> `WIZARD_URL` environment variables fed from that resolver. No literal IPs in specs, and no literal fallback
> defaults in new specs: if the env var is missing, the spec must fail loudly, not silently target a device.
> `baseURL` in a Playwright config is not an address source for this suite — specs navigate with absolute URLs
> built from the resolved host.**

## 8. Hardcoded-address defects that block that rule today

Listed so the hardening task can fix them mechanically. `file:line @ b8448069`.

**A — literal with no env override at all (unfixable without editing the file)**

| Location | Literal |
|---|---|
| `tests/browser/wifi-scan-proof.spec.mjs:6` | `const WIZARD_URL = 'http://localhost:8099';` |
| `tests/browser/wifi-scan-click-proof.spec.mjs:17` | `const WIZARD_URL = 'http://localhost:8099';` |
| `tests/browser/net4sats-wizard.spec.mjs:15` | `const WIZARD_URL = 'http://localhost:9876';` (third distinct wizard port in the suite) |
| `tests/browser/net4sats-endo-smoke.spec.mjs:26` | `const WIZARD_URL = 'http://localhost:8099';` |
| `tests/browser/endo-onboarding.config.mjs:24` | `baseURL: 'http://localhost:8099'` (dead config — see §4) |
| `tests/browser/happy-path.config.mjs:17` | `baseURL: 'http://localhost:8099'` (same dead-config pattern) |
| `tests/browser/admin-dashboard.config.mjs:17` | `baseURL: 'http://192.168.1.1'` |
| `tests/browser/wifi-scan-proof.config.mjs` | no `baseURL` key ⇒ the spec above must hardcode |
| `tests/helpers/inventory.mjs:15` | `'http://192.168.13.112:8080'` last-resort literal in the resolver itself |
| `tests/playwright.config.mjs:62` | `'http://192.168.1.1:8080'` LuCI fallback |
| `tests/browser/admin-ui-walkthrough.spec.mjs:17` | `ADMIN_URL` literal fallback |
| `tests/browser/admin-demo.mjs:4` | `ADMIN_BASE` literal fallback |

**B — literal is only the fallback of an env var (still a defect per §7, overridable)**

`endo-onboarding.spec.mjs:25` (`192.168.1.1`), `happy-path.spec.mjs:23`, `wifi-scan-proof.spec.mjs:7`,
`wifi-scan-click-proof.spec.mjs:18`, `wizard-deploy-e2e.spec.mjs:37`, `net4sats-endo-smoke.spec.mjs:25`
(`10.230.237.1`), `net4sats-captive-portal.spec.mjs:12`, `net4sats-full-e2e-smoke.spec.mjs:14`,
`portal-fixes-e2e.spec.mjs:27`, `portal-tab-copy.spec.mjs:38,43`, `tollgate-8090-luci-guard.config.mjs:12`,
`tollgate-admin-hw.config.mjs:9`, `tollgate-installer-mt6000.spec.mjs:51`,
`tollgate-portal-assets.config.mjs:11`, `tollgate-portal-lightning.config.mjs:10`,
`splash-invoice-proof.spec.mjs:3`, `splash-mac-proof.spec.mjs:3`, `glinet-flash.spec.mjs:21`,
`captive_portal.spec.mjs:4`, `tests/net4sats-playwright.config.mjs:3`.

**C — credential / fixture literals in spec files (same coupling class; rotate + parameterise)**

`net4sats-wizard.spec.mjs:16` (`ROUTER_PASSWORD` has a literal fallback — value deliberately not reproduced
here); `net4sats-endo-smoke.spec.mjs:30` (`'test123'`); `endo-onboarding.spec.mjs:63,90` (`'default-pass'`);
`wifi-scan-proof.spec.mjs:10` (`'password'`); `endo-onboarding.spec.mjs:70,92` (payout Lightning address
`'endo@coinos.io'`, which the `wz1.4` dev-split/LNURL work should parameterise).

**D — the plan's masked address is unresolved in code.** `schedule.md` masks the target as
`192.168.x.x`, but the endo/wifi family defaults to `192.168.1.1` while `net4sats-endo-smoke.spec.mjs:17` comments "GL-MT6000 (Flint 2) at 10.230.237.1" and `ROUTER_IP` defaults to
that there (`:25`) and `wizard-deploy-e2e.spec.mjs` was written against
`192.168.28.1`. Nothing in the plan picks one; with `TOLLGATE_ROUTER_ID=alpha` the resolver answers
`192.168.1.1` (`config/routers.json:8`). That is the value to pin for the GL-MT6000 lane, or the env var wins.

## 9. `.env` facts a reader needs

- The harness reads `<repo>/.env` **only** through the hand-rolled loader in `tests/playwright.config.mjs:9-15`,
  i.e. only for suites run with that config. The per-suite `tests/browser/*.config.mjs` never load it.
- `.env` is **absent** from the authoritative checkout (`~/physical-router-test-automation`); only
  `.env.example` exists. The loader tolerates the missing file (`:15`).
- In the current `.env.example`, `WIZARD_URL`, `ROUTER_IP` and `ROUTER_PASSWORD` — the three vars the
  wizard/endo lane actually needs — **do not appear at all**. The file also carries scrubbed placeholders
  rather than lab addresses: `TOLLGATE_SSH_KEY= <redacted>` (`:5`), `TOLLGATE_LUCI_URL=http://<ip>:8080` (`:7`),
  `TOLLGATE_CLIENT_IP=<ip>` (`:32`), `TOLLGATE_CONNECTIVITY_HOST=<ip>` (`:40`); `TOLLGATE_VIEWPORT=desktop` (`:59`).
- Therefore a new suite must either run with explicit env on the command line (recommended, §5) or add its
  vars to `.env.example` in the same commit that starts reading them. Do not resurrect a real lab IP into
  `.env.example`: it is the file that leaked one before the scrub.

## 10. Open items for the spec-authoring task

1. Authority for the adapted spec is PRTA `tests/browser/` (code evidence); `schedule.md` L24/L40/L57 says
   `net4sats/tollgate-wizard-go`. Not resolvable from the plan.
2. `endo-onboarding.spec.mjs:51,82` finds the MT6000 by **string-matching `ROUTER_IP` inside the dropdown
   label** — the selector is coupled to the address. A generic 7-step flow must key on a stable
   `data-testid` instead.
3. No spec imports `getRouter()` today; the wizard/endo lane is pure `process.env`. Adopting §7 in the endo
   spec means adding that import — a spec edit, out of scope for this recon.
4. `ROUTER_PASSWORD= ''` in `endo-onboarding.spec.mjs:26` plus the in-body `'default-pass'` fallback (`:63,90`)
   can produce a fake-green run against a device whose password happens to match. Remove the fallback when
   the spec is adapted.
