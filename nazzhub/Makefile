include $(TOPDIR)/rules.mk

PKG_NAME:=nazzhub

NAZZHUB_SOURCE_VERSION:=$(or $(NAZZHUB_PACKAGE_VERSION),$(NAZZHUB_VERSION),$(FORKOP_PACKAGE_VERSION),$(FORKOP_VERSION))
NAZZHUB_HAS_RELEASE_VERSION:=$(if $(filter dev,$(NAZZHUB_SOURCE_VERSION)),,$(NAZZHUB_SOURCE_VERSION))
NAZZHUB_COMPILED_VERSION:=$(if $(NAZZHUB_HAS_RELEASE_VERSION),$(NAZZHUB_SOURCE_VERSION),$(or $(NAZZHUB_SOURCE_VERSION),dev))
NAZZHUB_RELEASE_VERSION_VALID:=$(if $(NAZZHUB_HAS_RELEASE_VERSION),$(shell printf '%s\n' '$(NAZZHUB_SOURCE_VERSION)' | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' && printf '1'),1)

ifeq ($(NAZZHUB_RELEASE_VERSION_VALID),)
$(error NAZZHUB_PACKAGE_VERSION and NAZZHUB_VERSION must use x.y.z format)
endif

PKG_VERSION:=$(or $(NAZZHUB_HAS_RELEASE_VERSION),0.0.0)
PKG_RELEASE:=

PKG_MAINTAINER:=dedderos-prog <dedderos-prog@users.noreply.github.com>
PKG_LICENSE:=GPL-2.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/nazzhub
	SECTION:=net
	CATEGORY:=Network
	DEPENDS:=+ca-bundle +kmod-inet-diag +kmod-netlink-diag +kmod-tun +curl +ucode +ucode-mod-fs +ucode-mod-uci +kmod-nft-tproxy +coreutils-base64 +bind-dig +nftables +kmod-nft-nat +ip-full
	CONFLICTS:=https-dns-proxy nextdns luci-app-passwall luci-app-passwall2
	TITLE:=NAZZHUB backend service
	URL:=https://github.com/dedderos-prog/nazzhub
	PKGARCH:=all
endef

define Package/nazzhub/description
	Rule-based NAZZHUB backend with hybrid sing-box + zapret orchestration
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/nazzhub/prerm
#!/usr/bin/ucode

if (getenv("IPKG_INSTROOT") == null || getenv("IPKG_INSTROOT") == "")
	system("/usr/bin/nazzhub package_prerm " + (ARGV[0] || "") + " >/dev/null 2>&1");

exit(0);
endef

define Package/nazzhub/postinst
#!/bin/sh

[ -n "$${IPKG_INSTROOT}" ] && exit 0
NAZZHUB_LIB=/usr/lib/nazzhub ucode -L /usr/lib/nazzhub /usr/lib/nazzhub/config/migration.uc migrate || exit $$?
/usr/bin/nazzhub package_postinst
endef

define Package/nazzhub/conffiles
/etc/config/nazzhub
endef

define Package/nazzhub/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/nazzhub $(1)/etc/init.d/nazzhub

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/nazzhub $(1)/etc/config/nazzhub

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/nazzhub $(1)/usr/bin/nazzhub

	$(INSTALL_DIR) $(1)/usr/lib/nazzhub
	$(CP) ./files/usr/lib/. $(1)/usr/lib/nazzhub/

	sed -i -e 's/__COMPILED_VERSION_VARIABLE__/$(NAZZHUB_COMPILED_VERSION)/g' $(1)/usr/lib/nazzhub/core/constants.uc
endef

$(eval $(call BuildPackage,nazzhub))
