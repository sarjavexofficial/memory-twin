# Memory Twin: iPhoneプレビュー用トンネルの常駐ウォッチドッグ
# - ポート8081に誰もいなければ expo tunnel を起動し、落ちたら自動で再起動する
# - Windowsログオン時に自動開始（タスクスケジューラ「MemoryTwinTunnel」から起動される）
# - URLは .expo/settings.json のurlRandomnessから常に同じ: exp://yw8jjxo-anonymous-8081.exp.direct
$app = 'C:\company\ios-app'
$log = Join-Path $env:LOCALAPPDATA 'memory-twin-tunnel.log'

while ($true) {
  $listening = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    Add-Content $log "$(Get-Date -Format s) tunnel not running - starting"
    Set-Location $app
    # 起動中はここでブロックし、プロセスが死んだら次のループで再起動される
    & npx expo start --tunnel --port 8081 *>> $log
    Add-Content $log "$(Get-Date -Format s) tunnel exited"
    Start-Sleep -Seconds 10
  } else {
    Start-Sleep -Seconds 30
  }
}
