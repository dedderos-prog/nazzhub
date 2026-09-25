param(
    [string]$RouterIp = "192.168.1.1",
    [string]$User = "root"
)

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🚀 NAZZHUB: Прямая загрузка на роутер $User@$RouterIp" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

$BaseDir = $PSScriptRoot

# 1. Проверка доступности SSH
Write-Host "📡 Проверка подключения SSH к $RouterIp..." -ForegroundColor Cyan
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$User@$RouterIp" "echo 'SSH connection OK'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка подключения по SSH к $User@$RouterIp. Убедитесь, что роутер включен и SSH доступен." -ForegroundColor Red
    exit 1
}

# 2. Установка базовых зависимостей на роутер
Write-Host "📦 Установка пакетов зависимостей на роутер..." -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=no "$User@$RouterIp" @"
    opkg update 2>/dev/null || apk update 2>/dev/null || true
    opkg install ca-bundle curl ucode ucode-mod-fs ucode-mod-uci nftables ip-full sing-box luci-base 2>/dev/null || true
"@

# 3. Копирование файлов на роутер
Write-Host "📂 Копирование файлов службы nazzhub..." -ForegroundColor Cyan
scp -r -o StrictHostKeyChecking=no "$BaseDir/nazzhub/files/*" "$User@$RouterIp`:/"

Write-Host "🖥️ Копирование файлов интерфейса luci-app-nazzhub..." -ForegroundColor Cyan
scp -r -o StrictHostKeyChecking=no "$BaseDir/luci-app-nazzhub/htdocs/*" "$User@$RouterIp`:/www/"
scp -r -o StrictHostKeyChecking=no "$BaseDir/luci-app-nazzhub/root/*" "$User@$RouterIp`:/"

# 4. Настройка прав, сброс кэша и перезапуск служб
Write-Host "🔄 Настройка прав и перезапуск служб на роутере..." -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=no "$User@$RouterIp" @"
    chmod 0755 /etc/init.d/nazzhub /usr/bin/nazzhub /etc/uci-defaults/50_luci-nazzhub 2>/dev/null || true
    /etc/uci-defaults/50_luci-nazzhub 2>/dev/null || true
    rm -f /tmp/luci-indexcache* /var/luci-indexcache* /tmp/luci-modulecache* 2>/dev/null || true
    /etc/init.d/rpcd restart 2>/dev/null || true
    /etc/init.d/nazzhub enable 2>/dev/null || true
    /etc/init.d/nazzhub restart 2>/dev/null || true
"@

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 NAZZHUB успешно развернут на роутере $RouterIp!" -ForegroundColor Green
Write-Host "📌 Откройте в браузере: http://$RouterIp/cgi-bin/luci/admin/services/nazzhub" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
