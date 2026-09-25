include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nazzhub

NAZZHUB_SOURCE_VERSION:=$(or $(NAZZHUB_PACKAGE_VERSION),$(NAZZHUB_VERSION),$(FORKOP_PACKAGE_VERSION),$(FORKOP_VERSION))
NAZZHUB_HAS_RELEASE_VERSION:=$(if $(filter dev,$(NAZZHUB_SOURCE_VERSION)),,$(NAZZHUB_SOURCE_VERSION))
NAZZHUB_COMPILED_VERSION:=$(if $(NAZZHUB_HAS_RELEASE_VERSION),$(NAZZHUB_SOURCE_VERSION),$(or $(NAZZHUB_SOURCE_VERSION),dev))
NAZZHUB_RELEASE_VERSION_VALID:=$(if $(NAZZHUB_HAS_RELEASE_VERSION),$(shell printf '%s\n' '$(NAZZHUB_SOURCE_VERSION)' | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' && printf '1'),1)

ifeq ($(NAZZHUB_RELEASE_VERSION_VALID),)
$(error NAZZHUB_PACKAGE_VERSION and NAZZHUB_VERSION must use x.y.z format)
endif

PKG_VERSION:=$(or $(NAZZHUB_HAS_RELEASE_VERSION),0.0.0)
PKG_RELEASE:=
PKG_PO_VERSION:=$(PKG_VERSION)

LUCI_TITLE:=LuCI NAZZHUB app
LUCI_DEPENDS:=+luci-base +nazzhub
LUCI_PKGARCH:=all
LUCI_LANG.ru:=Русский (Russian)
LUCI_LANG.en:=English
LUCI_MAINTAINER:=dedderos-prog <dedderos-prog@users.noreply.github.com>
LUCI_DESCRIPTION:=Rule-based NAZZHUB LuCI app with hybrid sing-box + zapret orchestration
LUCI_MINIFY_JS:=0

PKG_LICENSE:=GPL-2.0-or-later
LUCI_LANGUAGES:=en ru

define Build/Prepare/$(PKG_NAME)
	sed -i -e 's/__COMPILED_VERSION_VARIABLE__/$(NAZZHUB_COMPILED_VERSION)/g' $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/nazzhub/main.js
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
