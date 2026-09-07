#!/bin/sh
set -e

ROUTER=${1:-192.168.1.1}
REMOTE_USER=root

echo "Building..."
npm run build

echo "Deploying admin to $ROUTER..."
ssh "$REMOTE_USER@$ROUTER" "mkdir -p /www/net4sats"
scp -r dist/admin/. "$REMOTE_USER@$ROUTER:/www/net4sats/"

# Deploy balance page to admin panel (if built separately)
if [ -d dist/balance ]; then
  echo "Deploying balance page to $ROUTER..."
  scp dist/balance/balance.html "$REMOTE_USER@$ROUTER:/www/net4sats/balance.html" 2>/dev/null || true
  ssh "$REMOTE_USER@$ROUTER" "mkdir -p /www/net4sats/assets"
  scp dist/balance/assets/balance-*.js dist/balance/assets/balance-*.css "$REMOTE_USER@$ROUTER:/www/net4sats/assets/" 2>/dev/null || true
fi

echo "Deploying captive portal to $ROUTER..."
ssh "$REMOTE_USER@$ROUTER" "mkdir -p /etc/tollgate/net4sats-captive-portal-site"
scp -r dist/portal/. "$REMOTE_USER@$ROUTER:/etc/tollgate/net4sats-captive-portal-site/"
# Repoint the NoDogSplash htdocs symlink (managed by tollgate-wrt) at our portal.
ssh "$REMOTE_USER@$ROUTER" "rm -rf /etc/nodogsplash/htdocs && ln -s /etc/tollgate/net4sats-captive-portal-site /etc/nodogsplash/htdocs"

echo "Installing rpcd plugin..."
ssh "$REMOTE_USER@$ROUTER" "mkdir -p /usr/libexec/rpcd /usr/share/rpcd/acl.d"
scp openwrt/rpcd/tollgate "$REMOTE_USER@$ROUTER:/usr/libexec/rpcd/tollgate"
scp openwrt/rpcd/tollgate_acl.json "$REMOTE_USER@$ROUTER:/usr/share/rpcd/acl.d/tollgate.json"
ssh "$REMOTE_USER@$ROUTER" "chmod +x /usr/libexec/rpcd/tollgate; /etc/init.d/rpcd restart"

echo "Configuring uhttpd..."
scp openwrt/files/etc/config/uhttpd_net4sats "$REMOTE_USER@$ROUTER:/etc/config/uhttpd_net4sats"
ssh "$REMOTE_USER@$ROUTER" "/etc/init.d/uhttpd restart"

echo "Adding tollgate.lan DNS entry..."
ssh "$REMOTE_USER@$ROUTER" "grep -q 'tollgate.lan' /etc/hosts || echo '$ROUTER tollgate.lan' >> /etc/hosts; killall -HUP dnsmasq 2>/dev/null; true"

echo "Restarting NoDogSplash..."
ssh "$REMOTE_USER@$ROUTER" "/etc/init.d/nodogsplash restart 2>/dev/null || echo 'nodogsplash not installed'"

echo "Done!"
echo "  Admin:    http://tollgate.lan/ or http://$ROUTER/"
echo "  Portal:   http://$ROUTER:2050/ (via NoDogSplash redirect)"
echo "  LuCI:     http://$ROUTER:8080/"
