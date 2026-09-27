param(
    [string]$RouterIp = "192.168.1.1",
    [string]$User = "root"
)

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "NAZZHUB: Deploying to router $User@$RouterIp" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

$BaseDir = $PSScriptRoot

# 1. Check SSH
Write-Host "Checking SSH connection to $RouterIp..." -ForegroundColor Cyan
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$User@$RouterIp" "echo 'SSH connection OK'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH connection failed to $User@$RouterIp." -ForegroundColor Red
    exit 1
}

# 2. Copy files
Write-Host "Copying nazzhub service files..." -ForegroundColor Cyan
scp -O -r -o StrictHostKeyChecking=no "$BaseDir/nazzhub/files/etc/*" "${User}@${RouterIp}:/etc/"
scp -O -r -o StrictHostKeyChecking=no "$BaseDir/nazzhub/files/usr/bin/*" "${User}@${RouterIp}:/usr/bin/"
ssh -o StrictHostKeyChecking=no "$User@$RouterIp" "mkdir -p /usr/lib/nazzhub; rm -rf /usr/lib/components /usr/lib/config /usr/lib/core /usr/lib/diagnostics /usr/lib/dns /usr/lib/dnsmasq /usr/lib/providers /usr/lib/routing /usr/lib/server /usr/lib/service /usr/lib/singbox /usr/lib/subscription"
scp -O -r -o StrictHostKeyChecking=no "$BaseDir/nazzhub/files/usr/lib/*" "${User}@${RouterIp}:/usr/lib/nazzhub/"

Write-Host "Copying luci-app-nazzhub UI files..." -ForegroundColor Cyan
scp -O -r -o StrictHostKeyChecking=no "$BaseDir/luci-app-nazzhub/htdocs/*" "${User}@${RouterIp}:/www/"
scp -O -r -o StrictHostKeyChecking=no "$BaseDir/luci-app-nazzhub/root/*" "${User}@${RouterIp}:/"

# 3. Permissions and reload
Write-Host "Setting permissions and restarting services..." -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=no "$User@$RouterIp" "chmod 0755 /etc/init.d/nazzhub /usr/bin/nazzhub /etc/uci-defaults/50_luci-nazzhub 2>/dev/null; /etc/uci-defaults/50_luci-nazzhub 2>/dev/null; rm -f /tmp/luci-indexcache* /var/luci-indexcache* /tmp/luci-modulecache* 2>/dev/null; /etc/init.d/rpcd restart 2>/dev/null; /etc/init.d/nazzhub enable 2>/dev/null; /etc/init.d/nazzhub restart 2>/dev/null"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "NAZZHUB successfully deployed to router $RouterIp!" -ForegroundColor Green
Write-Host "Open in browser: http://$RouterIp/cgi-bin/luci/admin/services/nazzhub" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
