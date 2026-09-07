#!/bin/bash
set -euo pipefail

# Arch-independent (admin SPA + shell rpcd + JSON): built once as
# Architecture: all. A leading arch argument is accepted and ignored.
case "${1:-}" in
    aarch64_*|arm_*|mips_*|mipsel_*|x86_64|all) shift ;;
esac
VERSION="${1:-$(jq -r .version package.json)}"
ARCH="all"
PACKAGE_NAME="net4sats-admin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/dist"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "=== Building $PACKAGE_NAME ipk ==="
echo "  Architecture: $ARCH"
echo "  Version:      $VERSION"
echo "  Source:       $BUILD_DIR/admin"

if [ ! -d "$BUILD_DIR/admin" ]; then
    echo "ERROR: Admin build output not found. Run 'npm run build' first."
    exit 1
fi

CTRL_DIR="$WORK_DIR/control"
DATA_DIR="$WORK_DIR/data"

mkdir -p "$CTRL_DIR" "$DATA_DIR"

# Install admin SPA to /www/net4sats/
mkdir -p "$DATA_DIR/www/net4sats"
cp -r "$BUILD_DIR/admin/." "$DATA_DIR/www/net4sats/"

# Install balance page (if built separately, merge into admin package)
if [ -d "$BUILD_DIR/balance" ]; then
  cp "$BUILD_DIR/balance/balance.html" "$DATA_DIR/www/net4sats/balance.html"
  mkdir -p "$DATA_DIR/www/net4sats/assets"
  cp "$BUILD_DIR/balance/assets/balance-"*.js "$DATA_DIR/www/net4sats/assets/" 2>/dev/null || true
  cp "$BUILD_DIR/balance/assets/balance-"*.css "$DATA_DIR/www/net4sats/assets/" 2>/dev/null || true
  echo "  Balance page included in IPK"
fi

# Install rpcd plugin for tollgate CLI integration
mkdir -p "$DATA_DIR/usr/libexec/rpcd"
cp "$REPO_ROOT/openwrt/rpcd/tollgate" "$DATA_DIR/usr/libexec/rpcd/tollgate"
chmod 755 "$DATA_DIR/usr/libexec/rpcd/tollgate"

# Install rpcd ACL
mkdir -p "$DATA_DIR/usr/share/rpcd/acl.d"
cp "$REPO_ROOT/openwrt/rpcd/tollgate_acl.json" "$DATA_DIR/usr/share/rpcd/acl.d/tollgate.json"

cat > "$CTRL_DIR/control" << EOF
Package: net4sats-admin
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: net4sats <dev@net4sats.com>
License: MIT
Depends: tollgate-wrt, luci, jq
Description: net4sats admin panel for TollGate routers
 Preact-based admin SPA at /net4sats/ for managing TollGate
 configuration, WiFi settings, wallet, and device status.
 Includes rpcd plugin for tollgate --json CLI integration.
EOF

cp "$SCRIPT_DIR/postinst-admin" "$CTRL_DIR/postinst"
cp "$SCRIPT_DIR/prerm-admin" "$CTRL_DIR/prerm"
chmod 755 "$CTRL_DIR/postinst" "$CTRL_DIR/prerm"

cd "$WORK_DIR"
tar -czf control.tar.gz -C "$CTRL_DIR" .
tar -czf data.tar.gz -C "$DATA_DIR" .

echo "2.0" > debian-binary

OUTPUT="$REPO_ROOT/${PACKAGE_NAME}_${VERSION}_${ARCH}.ipk"
# OpenWrt opkg expects gzip-compressed tarball, not ar archive
tar -czf "$OUTPUT" ./debian-binary ./control.tar.gz ./data.tar.gz

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "=== Built: $OUTPUT ($SIZE) ==="
