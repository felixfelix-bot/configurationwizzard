import { execFileSync } from 'node:child_process';
import { copyFileSync, renameSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = process.cwd();

function build(app) {
  console.log(`\nBuilding ${app}...`);
  execFileSync('npx', ['vite', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_APP: app },
  });
}

build('admin');
build('portal');
build('balance');

// Ensure portal has index.html (uhttpd expects it, Vite outputs splash.html)
const portalSplash = `${rootDir}/dist/portal/splash.html`;
const portalIndex = `${rootDir}/dist/portal/index.html`;
if (existsSync(portalSplash) && !existsSync(portalIndex)) {
  copyFileSync(portalSplash, portalIndex);
  console.log('Copied portal/splash.html → portal/index.html');
}

// Ensure balance has index.html (uhttpd expects it, Vite outputs balance.html)
const balanceHtml = `${rootDir}/dist/balance/balance.html`;
const balanceIndex = `${rootDir}/dist/balance/index.html`;
if (existsSync(balanceHtml) && !existsSync(balanceIndex)) {
  copyFileSync(balanceHtml, balanceIndex);
  console.log('Copied balance/balance.html → balance/index.html');
}

// Merge balance build output into dist/admin/ so that deploy.sh and
// build-ipk-admin.sh — which only deploy dist/admin/ to /www/net4sats/ —
// automatically include balance.html and its JS/CSS assets.
// Without this, http://router:8090/net4sats/balance.html returns 404 after
// Cashu payment (captive-portal.tsx redirects there on success).
const adminDir = `${rootDir}/dist/admin`;
const balanceDir = `${rootDir}/dist/balance`;
if (existsSync(adminDir) && existsSync(balanceDir)) {
  // Copy balance.html into admin/
  if (existsSync(balanceHtml)) {
    copyFileSync(balanceHtml, join(adminDir, 'balance.html'));
    console.log('Merged balance/balance.html → admin/balance.html');
  }
  // Copy balance-*.js and balance-*.css into admin/assets/
  const adminAssetsDir = join(adminDir, 'assets');
  if (!existsSync(adminAssetsDir)) mkdirSync(adminAssetsDir, { recursive: true });
  const balanceAssetsDir = join(balanceDir, 'assets');
  if (existsSync(balanceAssetsDir)) {
    for (const f of readdirSync(balanceAssetsDir)) {
      if (f.startsWith('balance-')) {
        copyFileSync(join(balanceAssetsDir, f), join(adminAssetsDir, f));
        console.log(`Merged balance/assets/${f} → admin/assets/${f}`);
      }
    }
  }
}

// Version-bust service worker CACHE_NAME at build time
const stamp = Date.now().toString(36);
for (const dir of ['admin', 'portal']) {
  const path = `${rootDir}/dist/${dir}/sw.js`;
  let content = readFileSync(path, 'utf8');
  content = content.replace("'net4sats-v1'", `'net4sats-${stamp}'`);
  writeFileSync(path, content);
}
console.log(`Service worker cache version: net4sats-${stamp}`);

console.log('\nDone: dist/admin/, dist/portal/, and dist/balance/');