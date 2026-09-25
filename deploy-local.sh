#!/bin/sh
# ==============================================================================
# NAZZHUB Local Deploy Script (Direct SCP/SSH from PC to Router)
# Usage: ./deploy-local.sh [ROUTER_IP] [USER]
# Example: ./deploy-local.sh 192.168.1.1 root
# ==============================================================================

set -e

ROUTER_IP="${1:-192.168.1.1}"
ROUTER_USER="${2:-root}"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

printf '\033[32;1m==========================================================\033[0m\n'
printf '\033[32;1m🚀 NAZZHUB: Прямая загрузка на роутер %s@%s\033[0m\n' "$ROUTER_USER" "$ROUTER_IP"
printf '\033[32;1m==========================================================\033[0m\n'

# 1. SSH Test
printf '\033[36m📡 Проверка подключения SSH к %s...\033[0m\n' "$ROUTER_IP"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${ROUTER_USER}@${ROUTER_IP}" "echo 'SSH connection OK'"

# 2. Install dependencies
printf '\033[36m📦 Установка зависимостей на роутер...\033[0m\n'
ssh -o StrictHostKeyChecking=no "${ROUTER_USER}@${ROUTER_IP}" "opkg update 2>/dev/null || apk update 2>/dev/null || true; opkg install ca-bundle curl ucode ucode-mod-fs ucode-mod-uci nftables ip-full sing-box luci-base 2>/dev/null || true"

# 3. Copy files
printf '\033[36m📂 Копирование файлов службы nazzhub...\033[0m\n'
scp -r -o StrictHostKeyChecking=no "$BASE_DIR/nazzhub/files/"* "${ROUTER_USER}@${ROUTER_IP}:/"

printf '\033[36m🖥️ Копирование файлов веб-интерфейса LuCI...\033[0m\n'
scp -r -o StrictHostKeyChecking=no "$BASE_DIR/luci-app-nazzhub/htdocs/"* "${ROUTER_USER}@${ROUTER_IP}:/www/"
scp -r -o StrictHostKeyChecking=no "$BASE_DIR/luci-app-nazzhub/root/"* "${ROUTER_USER}@${ROUTER_IP}:/"

# 4. Reload services
printf '\033[36m🔄 Применение настроек и перезапуск служб...\033[0m\n'
ssh -o StrictHostKeyChecking=no "${ROUTER_USER}@${ROUTER_IP}" "chmod 0755 /etc/init.d/nazzhub /usr/bin/nazzhub /etc/uci-defaults/50_luci-nazzhub 2>/dev/null || true; /etc/uci-defaults/50_luci-nazzhub 2>/dev/null || true; rm -f /tmp/luci-indexcache* /var/luci-indexcache* /tmp/luci-modulecache* 2>/dev/null || true; /etc/init.d/rpcd restart 2>/dev/null || true; /etc/init.d/nazzhub enable 2>/dev/null || true; /etc/init.d/nazzhub restart 2>/dev/null || true"

printf '\033[32;1m==========================================================\033[0m\n'
printf '\033[32;1m🎉 NAZZHUB успешно развернут на роутере %s!\033[0m\n' "$ROUTER_IP"
printf '\033[32;1m📌 Откройте в браузере: http://%s/cgi-bin/luci/admin/services/nazzhub\033[0m\n' "$ROUTER_IP"
printf '\033[32;1m==========================================================\033[0m\n'
