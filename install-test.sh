#!/bin/sh
# shellcheck shell=dash
# ==============================================================================
# NAZZHUB Installer & Uninstaller
# Usage:
#   sh -c "$(wget -qO- https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install-test.sh)"
#   или
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install-test.sh)"
#   или
#   sh <(wget -O - https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install-test.sh)
# ==============================================================================

set -e

REPO_OWNER="dedderos-prog"
REPO_NAME="nazzhub"
BRANCH="main"
ACTION=""

# Parse CLI arguments early (allows --help without root)
for arg in "$@"; do
    case "$arg" in
        -h|--help)
            echo "Использование: $0 [ветка] [install|uninstall]"
            exit 0
            ;;
        -u|--uninstall|uninstall)
            ACTION="uninstall"
            ;;
        -i|--install|install)
            ACTION="install"
            ;;
        *)
            if [ -n "$arg" ] && [ "$arg" != "main" ]; then
                BRANCH="$arg"
            fi
            ;;
    esac
done

msg() {
    printf '\033[32;1m%s\033[0m\n' "$1"
}

warn() {
    printf '\033[33;1m%s\033[0m\n' "$1"
}

fail() {
    printf '\033[31;1m%s\033[0m\n' "$1" >&2
    exit 1
}

# 1. Root check
if [ "$(id -u)" -ne 0 ]; then
    fail "Этот скрипт должен быть запущен с правами root"
fi

# 2. Package manager detection
PKG_IS_APK=0
if command -v apk >/dev/null 2>&1; then
    PKG_IS_APK=1
fi

pkg_update() {
    if [ "$PKG_IS_APK" -eq 1 ]; then
        apk update </dev/null
    else
        opkg update </dev/null
    fi
}

pkg_install() {
    if [ "$PKG_IS_APK" -eq 1 ]; then
        apk add "$@" </dev/null
    else
        opkg install "$@" </dev/null
    fi
}

pkg_is_installed() {
    pkg="$1"
    if [ "$PKG_IS_APK" -eq 1 ]; then
        apk info -e "$pkg" >/dev/null 2>&1
    else
        opkg list-installed 2>/dev/null | awk -v p="$pkg" '$1 == p { found = 1 } END { exit(found ? 0 : 1) }'
    fi
}

# Complete uninstallation routine: deletes NAZZHUB and ALL related services and components
do_uninstall() {
    msg "=========================================================="
    msg "🗑️ NAZZHUB: Полное удаление всех связанных служб и файлов"
    msg "=========================================================="

    # 1. Восстановление исходных настроек DNS в dnsmasq
    msg "🔄 Восстановление исходных настроек DNS (dnsmasq)..."
    if [ -x /usr/bin/nazzhub ]; then
        /usr/bin/nazzhub restore_dnsmasq >/dev/null 2>&1 || true
    fi

    # Резервный откат конфигурации dhcp/dnsmasq в UCI
    if uci get dhcp.@dnsmasq[0].NAZZHUB_server >/dev/null 2>&1; then
        uci delete dhcp.@dnsmasq[0].server 2>/dev/null || true
        for s in $(uci get dhcp.@dnsmasq[0].NAZZHUB_server 2>/dev/null); do
            uci add_list dhcp.@dnsmasq[0].server="$s" 2>/dev/null || true
        done
        uci delete dhcp.@dnsmasq[0].NAZZHUB_server 2>/dev/null || true
    fi
    for opt in noresolv cachesize rebind_protection; do
        bak="$(uci get dhcp.@dnsmasq[0]."NAZZHUB_${opt}" 2>/dev/null || true)"
        if [ -n "$bak" ]; then
            uci set dhcp.@dnsmasq[0]."$opt"="$bak" 2>/dev/null || true
            uci delete dhcp.@dnsmasq[0]."NAZZHUB_${opt}" 2>/dev/null || true
        fi
    done
    # Также проверим старые резервные ключи FORKOP_ / PODKOP_
    for prefix in FORKOP PODKOP; do
        if uci get dhcp.@dnsmasq[0]."${prefix}_server" >/dev/null 2>&1; then
            uci delete dhcp.@dnsmasq[0].server 2>/dev/null || true
            for s in $(uci get dhcp.@dnsmasq[0]."${prefix}_server" 2>/dev/null); do
                uci add_list dhcp.@dnsmasq[0].server="$s" 2>/dev/null || true
            done
            uci delete dhcp.@dnsmasq[0]."${prefix}_server" 2>/dev/null || true
        fi
    done
    uci commit dhcp 2>/dev/null || true

    # 2. Остановка и отключение всех связанных служб
    msg "⏹️ Остановка и отключение всех связанных служб..."
    SERVICES_TO_STOP="nazzhub forkop sing-box zapret zapret2 byedpi"
    for s in $SERVICES_TO_STOP; do
        if [ -x "/etc/init.d/$s" ]; then
            "/etc/init.d/$s" stop >/dev/null 2>&1 || true
            "/etc/init.d/$s" disable >/dev/null 2>&1 || true
            rm -f "/etc/init.d/$s"
        fi
    done

    # Завершение всех связанных процессов
    killall -9 nazzhub sing-box nfqws nfqws2 ciadpi forkop 2>/dev/null || true

    # 3. Очистка таблиц nftables и правил маршрутизации
    msg "🌐 Очистка правил nftables и маршрутизации..."
    for table in nazzhub forkop zapret zapret2 byedpi; do
        nft delete table inet "$table" >/dev/null 2>&1 || true
    done

    for mark in 105 0x105; do
        ip -4 rule del fwmark "$mark/$mark" 2>/dev/null || true
        ip -6 rule del fwmark "$mark/$mark" 2>/dev/null || true
    done

    for tbl in 105 nazzhub forkop; do
        ip -4 rule del table "$tbl" 2>/dev/null || true
        ip -6 rule del table "$tbl" 2>/dev/null || true
        ip route flush table "$tbl" 2>/dev/null || true
        ip -6 route flush table "$tbl" 2>/dev/null || true
    done

    if [ -f /etc/iproute2/rt_tables ]; then
        sed -i '/nazzhub/d;/forkop/d' /etc/iproute2/rt_tables
    fi

    # 4. Удаление установленных пакетов через системный менеджер
    msg "📦 Удаление пакетов (NAZZHUB, sing-box, zapret, zapret2, byedpi, тема)..."
    PKGS_TO_REMOVE="luci-i18n-nazzhub-ru luci-app-nazzhub nazzhub sing-box sing-box-tiny sing-box-extended zapret zapret2 byedpi luci-theme-proton2025"
    if [ "$PKG_IS_APK" -eq 1 ]; then
        for p in $PKGS_TO_REMOVE; do
            if apk info -e "$p" >/dev/null 2>&1; then
                apk del "$p" >/dev/null 2>&1 || true
            fi
        done
    else
        for p in $PKGS_TO_REMOVE; do
            if opkg list-installed 2>/dev/null | awk -v pkg="$p" '$1 == pkg {found=1} END {exit(found ? 0 : 1)}'; then
                opkg remove --force-depends "$p" >/dev/null 2>&1 || true
            fi
        done
    fi

    # 5. Полное удаление файлов служб, бинарников, конфигураций и библиотек
    msg "🧹 Удаление файлов конфигураций, модулей, бинарников и каталогов..."
    rm -rf /usr/lib/nazzhub \
           /usr/lib/forkop \
           /usr/share/nazzhub \
           /usr/share/forkop \
           /www/luci-static/resources/view/nazzhub \
           /www/luci-static/resources/view/forkop \
           /www/luci-static/proton2025 \
           /etc/config/nazzhub* \
           /etc/config/forkop* \
           /etc/config/sing-box* \
           /etc/config/zapret* \
           /etc/config/byedpi* \
           /etc/nazzhub \
           /etc/forkop \
           /etc/sing-box \
           /etc/zapret \
           /etc/zapret2 \
           /etc/byedpi \
           /opt/zapret2 \
           /opt/zapret \
           /opt/byedpi \
           /usr/bin/nazzhub \
           /usr/bin/forkop \
           /usr/bin/sing-box \
           /usr/bin/ciadpi \
           /usr/bin/nfqws \
           /usr/bin/nfqws2 \
           /usr/lib/libcronet.so \
           /usr/share/luci/menu.d/luci-app-nazzhub.json \
           /usr/share/luci/menu.d/luci-app-forkop.json \
           /usr/share/luci/menu.d/luci-theme-proton2025.json \
           /usr/share/rpcd/acl.d/luci-app-nazzhub.json \
           /usr/share/rpcd/acl.d/luci-app-forkop.json \
           /etc/uci-defaults/50_luci-nazzhub \
           /etc/uci-defaults/50_luci-forkop \
           /usr/lib/lua/luci/i18n/nazzhub.* \
           /usr/lib/lua/luci/i18n/forkop.* \
           /tmp/nazzhub* /tmp/forkop* /tmp/sing-box* \
           /var/run/nazzhub* /var/run/forkop* /var/run/sing-box* /var/run/zapret* \
           /var/log/nazzhub* /var/log/forkop* /var/log/sing-box*

    rmdir /opt 2>/dev/null || true

    # 6. Восстановление темы оформления LuCI (если была установлена тема Proton2025)
    if [ "$(uci get luci.main.mediaurlbase 2>/dev/null)" = "/luci-static/proton2025" ]; then
        msg "🎨 Сброс темы интерфейса на стандартную..."
        uci delete luci.main.mediaurlbase 2>/dev/null || true
        if [ -d /www/luci-static/bootstrap ]; then
            uci set luci.main.mediaurlbase='/luci-static/bootstrap' 2>/dev/null || true
        fi
        uci commit luci 2>/dev/null || true
    fi

    # 7. Очистка заданий crontab
    msg "⚙️ Очистка заданий планировщика cron..."
    crontab -l 2>/dev/null | grep -Ev 'nazzhub|forkop|sing-box|zapret|ciadpi' | crontab - 2>/dev/null || true

    # 8. Сброс кэша интерфейса LuCI и перезапуск системных служб
    msg "🔄 Сброс кэша веб-интерфейса и перезапуск служб..."
    rm -f /tmp/luci-indexcache* /var/luci-indexcache* /tmp/luci-modulecache* 2>/dev/null || true

    if [ -x /etc/init.d/rpcd ]; then
        /etc/init.d/rpcd restart >/dev/null 2>&1 || true
    fi
    if [ -x /etc/init.d/dnsmasq ]; then
        /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    fi
    if [ -x /etc/init.d/firewall ]; then
        /etc/init.d/firewall restart >/dev/null 2>&1 || true
    fi

    printf '\n'
    msg "=========================================================="
    msg "✅ NAZZHUB и все связанные службы полностью удалены!"
    msg "=========================================================="
    exit 0
}

# Prompt interactive choice if not specified via arguments
choose_action() {
    [ -n "$ACTION" ] && return 0

    while :; do
        printf '\n%s\n' "Выберите действие:"
        printf '  1) Установить / обновить NAZZHUB\n'
        printf '  2) Полностью удалить NAZZHUB с роутера\n'
        printf '%s [1]: ' "Ваш выбор"

        answer=""
        if [ -r /dev/tty ]; then
            read -r answer < /dev/tty || answer="1"
        elif [ -t 0 ]; then
            read -r answer || answer="1"
        else
            answer="1"
        fi

        case "$answer" in
            1|"")
                ACTION="install"
                return 0
                ;;
            2)
                ACTION="uninstall"
                return 0
                ;;
            *)
                warn "Неверный выбор '$answer'. Пожалуйста, введите 1 или 2."
                ;;
        esac
    done
}

msg "=========================================================="
msg "🚀 NAZZHUB: Управление установкой на роутер"
msg "   Репозиторий: https://github.com/${REPO_OWNER}/${REPO_NAME}"
msg "   Ветка: ${BRANCH}"
msg "=========================================================="

choose_action "$@"

if [ "$ACTION" = "uninstall" ]; then
    do_uninstall
fi

msg "🚀 Начинаем установку / обновление NAZZHUB..."

# 3. Fetcher detection
FETCHER=""
if command -v wget >/dev/null 2>&1; then
    FETCHER="wget"
elif command -v curl >/dev/null 2>&1; then
    FETCHER="curl"
else
    fail "Не найден wget или curl. Установите их через opkg/apk."
fi

# 4. Check dependencies & install missing
msg "📦 Обновление списков пакетов..."
pkg_update || warn "Не удалось обновить списки пакетов, пробуем продолжить..."

CORE_DEPS="ca-bundle curl ucode ucode-mod-fs ucode-mod-uci nftables ip-full tar unzip"
OPTIONAL_DEPS="kmod-inet-diag kmod-netlink-diag kmod-tun kmod-nft-tproxy kmod-nft-nat coreutils-base64 bind-dig luci-base luci-i18n-base-ru luci-i18n-firewall-ru"

MISSING_DEPS=""
for pkg in $CORE_DEPS $OPTIONAL_DEPS; do
    if ! pkg_is_installed "$pkg"; then
        MISSING_DEPS="$MISSING_DEPS $pkg"
    fi
done

if [ -n "$MISSING_DEPS" ]; then
    msg "📥 Установка недостающих зависимостей:$MISSING_DEPS"
    # shellcheck disable=SC2086
    pkg_install $MISSING_DEPS || warn "Некоторые зависимости не удалось установить, продолжаем..."
fi

# Ensure Russian LuCI base language pack is installed
if ! pkg_is_installed luci-i18n-base-ru; then
    msg "📥 Установка русского языкового пакета LuCI (luci-i18n-base-ru)..."
    pkg_install luci-i18n-base-ru || warn "Не удалось установить luci-i18n-base-ru"
fi

if ! command -v unzip >/dev/null 2>&1; then
    msg "📥 Установка unzip..."
    pkg_install unzip || warn "Не удалось установить unzip"
fi

# 5. Sing-box installation check
if ! command -v sing-box >/dev/null 2>&1; then
    msg "📥 sing-box не найден в системе, выполняем установку..."
    pkg_install sing-box || warn "Пакет sing-box не найден в репозитории OpenWrt. Его можно будет установить позже через LuCI или вручную."
fi

# 6. Temporary directory setup
TMP_DIR="$(mktemp -d /tmp/nazzhub-install.XXXXXX 2>/dev/null || true)"
[ -n "$TMP_DIR" ] || TMP_DIR="/tmp/nazzhub-install.$$"
mkdir -p "$TMP_DIR"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

# 7. Download archive from GitHub branch
ARCHIVE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.tar.gz"
ARCHIVE_FILE="$TMP_DIR/nazzhub.tar.gz"

download_file() {
    url="$1"
    dest="$2"
    if command -v curl >/dev/null 2>&1; then
        if curl -fsSL --retry 3 --connect-timeout 15 "$url" -o "$dest"; then
            return 0
        fi
    fi
    if command -v wget >/dev/null 2>&1; then
        if wget -T 15 -O "$dest" "$url"; then
            return 0
        fi
    fi
    return 1
}

msg "🌐 Загрузка исходных файлов NAZZHUB из ${ARCHIVE_URL}..."
download_file "$ARCHIVE_URL" "$ARCHIVE_FILE" || fail "Не удалось скачать архив репозитория"

msg "📂 Распаковка архива..."
tar -xzf "$ARCHIVE_FILE" -C "$TMP_DIR"

EXTRACTED_DIR=""
for d in "$TMP_DIR"/* "$TMP_DIR"; do
    if [ -d "$d/nazzhub/files" ]; then
        EXTRACTED_DIR="$d"
        break
    fi
done

if [ -z "$EXTRACTED_DIR" ] || [ ! -d "$EXTRACTED_DIR/nazzhub/files" ]; then
    fail "Не удалось найти распакованные файлы nazzhub в архиве"
fi

msg "   ✓ Распаковано в $EXTRACTED_DIR"

# 8. Stop old/conflicting services if running
if [ -x /etc/init.d/nazzhub ]; then
    /etc/init.d/nazzhub stop 2>/dev/null || true
fi
if [ -x /etc/init.d/forkop ]; then
    /etc/init.d/forkop stop 2>/dev/null || true
    /etc/init.d/forkop disable 2>/dev/null || true
fi
if [ -x /etc/init.d/sing-box ]; then
    /etc/init.d/sing-box stop 2>/dev/null || true
    /etc/init.d/sing-box disable 2>/dev/null || true
fi

# 9. Deploy backend files
msg "⚙️ Копирование файлов службы NAZZHUB..."

mkdir -p /etc/config
mkdir -p /etc/init.d
mkdir -p /usr/bin
mkdir -p /usr/lib/nazzhub

# Configuration
if [ ! -f /etc/config/nazzhub ] || [ "$FORCE_CONFIG" = "1" ]; then
    cp "$EXTRACTED_DIR/nazzhub/files/etc/config/nazzhub" /etc/config/nazzhub
    chmod 0644 /etc/config/nazzhub
    msg "   ✓ Установлена конфигурация /etc/config/nazzhub"
else
    cp "$EXTRACTED_DIR/nazzhub/files/etc/config/nazzhub" /etc/config/nazzhub.default
    msg "   ℹ️ Существующая конфигурация сохранена (для сброса на дефолты используйте FORCE_CONFIG=1)"
fi

# Service & CLI
cp "$EXTRACTED_DIR/nazzhub/files/etc/init.d/nazzhub" /etc/init.d/nazzhub
chmod 0755 /etc/init.d/nazzhub

cp "$EXTRACTED_DIR/nazzhub/files/usr/bin/nazzhub" /usr/bin/nazzhub
chmod 0755 /usr/bin/nazzhub

# Modules
cp -rf "$EXTRACTED_DIR/nazzhub/files/usr/lib/"* /usr/lib/nazzhub/
# Version replacement
sed -i 's/__COMPILED_VERSION_VARIABLE__/1.0.0/g' /usr/lib/nazzhub/core/constants.uc 2>/dev/null || true

# Strategies and assets
if [ -d "$EXTRACTED_DIR/nazzhub/files/usr/share" ]; then
    mkdir -p /usr/share
    cp -rf "$EXTRACTED_DIR/nazzhub/files/usr/share/"* /usr/share/
    msg "   ✓ Установлены стратегии обхода zapret в /usr/share/nazzhub/zapret-strategies"
fi

if [ -d "$EXTRACTED_DIR/nazzhub/files/opt" ]; then
    mkdir -p /opt/zapret/files/fake
    cp -rf "$EXTRACTED_DIR/nazzhub/files/opt/"* /opt/
    msg "   ✓ Установлены файлы fake пакетов в /opt/zapret/files/fake"
fi

# Zapret2 auto-installation by default
if [ ! -x /opt/zapret2/nfq2/nfqws2 ]; then
    msg "📥 zapret2 не найден в системе, выполняем автоустановку по умолчанию..."
    /usr/bin/nazzhub component_action zapret2 install || warn "Автоустановка zapret2 завершилась с предупреждением (можно установить через LuCI)"
else
    msg "   ✓ zapret2 уже установлен в системе"
fi

# 10. Deploy LuCI app files
msg "🖥️ Копирование файлов веб-интерфейса LuCI..."

mkdir -p /www/luci-static/resources/view/nazzhub
mkdir -p /usr/share/luci/menu.d
mkdir -p /usr/share/rpcd/acl.d
mkdir -p /etc/uci-defaults
mkdir -p /usr/lib/lua/luci/i18n

cp -rf "$EXTRACTED_DIR/luci-app-nazzhub/htdocs/luci-static/resources/view/nazzhub/"* /www/luci-static/resources/view/nazzhub/
sed -i 's/__COMPILED_VERSION_VARIABLE__/1.0.0/g' /www/luci-static/resources/view/nazzhub/main.js 2>/dev/null || true

cp "$EXTRACTED_DIR/luci-app-nazzhub/root/usr/share/luci/menu.d/luci-app-nazzhub.json" /usr/share/luci/menu.d/luci-app-nazzhub.json
cp "$EXTRACTED_DIR/luci-app-nazzhub/root/usr/share/rpcd/acl.d/luci-app-nazzhub.json" /usr/share/rpcd/acl.d/luci-app-nazzhub.json

if [ -f "$EXTRACTED_DIR/luci-app-nazzhub/root/usr/lib/lua/luci/i18n/nazzhub.ru.lmo" ]; then
    cp "$EXTRACTED_DIR/luci-app-nazzhub/root/usr/lib/lua/luci/i18n/nazzhub.ru.lmo" /usr/lib/lua/luci/i18n/nazzhub.ru.lmo
    msg "   ✓ Установлен языковой пакет /usr/lib/lua/luci/i18n/nazzhub.ru.lmo"
fi

cp "$EXTRACTED_DIR/luci-app-nazzhub/root/etc/uci-defaults/50_luci-nazzhub" /etc/uci-defaults/50_luci-nazzhub
chmod 0755 /etc/uci-defaults/50_luci-nazzhub

# 11. Theme installation: luci-theme-proton2025
msg "🎨 Проверка темы интерфейса Proton2025..."
if [ ! -d /www/luci-static/proton2025 ] && ! pkg_is_installed luci-theme-proton2025; then
    msg "📥 Установка темы luci-theme-proton2025..."
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://raw.githubusercontent.com/ChesterGoodiny/luci-theme-proton2025/main/install.sh | WITH_DASHBOARD=1 sh || warn "Не удалось установить тему proton2025"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://raw.githubusercontent.com/ChesterGoodiny/luci-theme-proton2025/main/install.sh | WITH_DASHBOARD=1 sh || warn "Не удалось установить тему proton2025"
    fi
fi
if [ -d /www/luci-static/proton2025 ] || pkg_is_installed luci-theme-proton2025; then
    uci set luci.main.mediaurlbase='/luci-static/proton2025'
    uci commit luci 2>/dev/null || true
    msg "   ✓ Тема Proton2025 активирована"
fi

if pkg_is_installed luci-i18n-base-ru || [ -f /usr/lib/lua/luci/i18n/base.ru.lmo ]; then
    uci set luci.main.lang='ru'
    uci commit luci 2>/dev/null || true
    msg "   ✓ Язык интерфейса LuCI установлен: русский (ru)"
fi

# 12. Run uci-defaults and reload LuCI / rpcd
msg "🔄 Применение настроек интерфейса и сброс кэша LuCI..."
/etc/uci-defaults/50_luci-nazzhub >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache* /var/luci-indexcache* /tmp/luci-modulecache* 2>/dev/null || true

if [ -x /etc/init.d/rpcd ]; then
    /etc/init.d/rpcd restart >/dev/null 2>&1 || true
fi

# 13. Disable autostart by default (manual start required via LuCI Diagnostics)
msg "⏸️ Служба NAZZHUB установлена (автозапуск sing-box отключен по требованию)..."
/etc/init.d/nazzhub disable >/dev/null 2>&1 || true
/etc/init.d/nazzhub stop >/dev/null 2>&1 || true

msg "=========================================================="
msg "🎉 NAZZHUB успешно установлен!"
msg "=========================================================="
printf '\n'
msg "📌 Веб-интерфейс доступен в LuCI: «Службы» -> «NAZZHUB»"
msg "📌 1-я вкладка «Подписка»: просмотр статуса, срока действия и ключа"
msg "📌 Для первого запуска перейдите во вкладку «Диагностика» и нажмите «Запустить NAZZHUB»"
printf '\n'
