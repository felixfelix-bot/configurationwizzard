# OpenWrt SDK recipe for the net4sats configuration wizard.
#
# This package ships a *prebuilt* Preact SPA (admin + captive portal) plus an
# rpcd plugin — there is nothing to cross-compile. The SDK is used only to
# assemble a properly-formatted package (ipk on 24.10.x, apk on 25.12.x).
#
# build-sdk-package.sh (and the CI apk job) stage the following next to this
# Makefile before invoking the SDK, and the install recipe reads them via
# $(PKG_MAKEFILE_DIR):
#   dist/admin/, dist/portal/   prebuilt SPA (npm run build)
#   rpcd/tollgate, rpcd/*.json  rpcd plugin + ACL (from openwrt/rpcd/)
#   files/...                   uci-defaults etc. (from packaging/files/)
PKG_MAKEFILE_DIR:=$(dir $(abspath $(lastword $(MAKEFILE_LIST))))

include $(TOPDIR)/rules.mk

PKG_NAME:=configurationwizzard

# PACKAGE_VERSION is supplied by CI / build-sdk-package.sh; fall back to a
# placeholder for ad-hoc SDK builds. apk-tools is strict about version
# syntax, so normalise it when building the apk format.
DISPLAY_VERSION:=$(if $(strip $(PACKAGE_VERSION)),$(PACKAGE_VERSION),0.0.0)
ifeq ($(CONFIG_USE_APK),y)
PKG_VERSION:=$(shell sh "$(PKG_MAKEFILE_DIR)normalize-apk-version.sh" "$(DISPLAY_VERSION)")
else
PKG_VERSION:=$(DISPLAY_VERSION)
PKG_RELEASE:=1
endif

PKG_MAINTAINER:=net4sats <dev@net4sats.com>
PKG_LICENSE:=MIT

# Allow overwriting files owned by other packages (nodogsplash ships its own
# /etc/nodogsplash/htdocs/splash.html). On ipk this pairs with REPLACES below;
# on apk this flag is what authorises the overwrite.
PKG_FLAGS:=overwrite

include $(INCLUDE_DIR)/package.mk

define Package/configurationwizzard
  SECTION:=net
  CATEGORY:=Network
  TITLE:=net4sats Configuration Wizard
  DEPENDS:=+tollgate-wrt +nodogsplash +luci +jq
  PROVIDES:=tollgate-captive-portal-site
  CONFLICTS:=tollgate-captive-portal
  REPLACES:=nodogsplash
  PKGARCH:=all
endef

define Package/configurationwizzard/description
  net4sats configuration wizard admin SPA and captive portal theme.
  Provides tollgate-captive-portal-site interface with Preact-based
  admin panel on /net4sats/ and captive portal on NoDogSplash.
endef

# Nothing to compile — the SPA is prebuilt and staged.
define Build/Compile
endef

define Package/configurationwizzard/install
	$(INSTALL_DIR) $(1)/www/net4sats
	$(CP) $(PKG_MAKEFILE_DIR)dist/admin/* $(1)/www/net4sats/

	# Ship the captive portal in our own directory; postinst repoints the
	# uhttpd.portal home directory at it. We do NOT touch
	# /etc/nodogsplash/htdocs — that redirect stub is owned by tollgate-wrt.
	$(INSTALL_DIR) $(1)/etc/tollgate/net4sats-captive-portal-site
	$(CP) $(PKG_MAKEFILE_DIR)dist/portal/* $(1)/etc/tollgate/net4sats-captive-portal-site/

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) $(PKG_MAKEFILE_DIR)rpcd/tollgate $(1)/usr/libexec/rpcd/tollgate

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_CONF) $(PKG_MAKEFILE_DIR)rpcd/tollgate_acl.json $(1)/usr/share/rpcd/acl.d/tollgate.json

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) $(PKG_MAKEFILE_DIR)files/etc/uci-defaults/91-configurationwizzard-setup $(1)/etc/uci-defaults/91-configurationwizzard-setup
endef

define Package/configurationwizzard/postinst
#!/bin/sh

if uci -q get nodogsplash.@nodogsplash[0] >/dev/null 2>&1; then
    uci set nodogsplash.@nodogsplash[0].gatewayport='2050'
    nds_users="$(uci -q get nodogsplash.@nodogsplash[0].users_to_router 2>/dev/null || echo '')"
    if ! echo "$$nds_users" | grep -q "port 2050"; then
        uci add_list nodogsplash.@nodogsplash[0].users_to_router='allow tcp port 2050'
    fi
    uci commit nodogsplash
fi

# Repoint the uhttpd.portal instance (set up by tollgate-wrt on :2051)
# at our captive portal SPA instead of tollgate-wrt's default portal.
# We do NOT touch /etc/nodogsplash/htdocs — that redirect stub is owned
# by tollgate-wrt's 90-tollgate-captive-portal-symlink script.
if uci -q get uhttpd.portal >/dev/null 2>&1; then
    uci set uhttpd.portal.home='/etc/tollgate/net4sats-captive-portal-site'
    uci commit uhttpd
fi

# Resolve .apk-new files left by apk when existing files were modified
# (e.g. by tollgate-wrt symlink management or sysupgrade preservation).
find /etc/tollgate/net4sats-captive-portal-site /www/net4sats -name '*.apk-new' \
	-exec sh -c 'mv "$$1" "$${1%.apk-new}"' _ {} \;

/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

/etc/init.d/nodogsplash restart 2>/dev/null || true
endef

define Package/configurationwizzard/prerm
#!/bin/sh
/etc/init.d/nodogsplash restart 2>/dev/null || true
endef

$(eval $(call BuildPackage,configurationwizzard))
