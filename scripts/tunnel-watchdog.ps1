# Memory Twin: iPhoneプレビュー用トンネルの常駐ウォッチドッグ
# - ポート8081に誰もいなければ expo tunnel を起動し、落ちたら自動で再起動する
# - Windowsログオン時に自動開始（スタートアップの memory-twin-tunnel.vbs から起動される）
# - 起動後はiOS用バンドルを「予熱」する: iPhoneが繋ぐ前にビルドを済ませておき、
#   アプリを開いた瞬間の待ち時間をビルド時間ぶん（1〜2分→数秒）短縮する
# - 注意: トンネルURLはExpoが起動ごとに再発行する（固定できない）。現在のURLは
#   .expo/settings.json の urlRandomness を小文字にした exp://<値>-anonymous-8081.exp.direct
$app = 'C:\company\ios-app'
$log = Join-Path $env:LOCALAPPDATA 'memory-twin-tunnel.log'

function Warm-Bundle {
  # マニフェストからバンドルURLを取り、一度取得してMetroにビルド・キャッシュさせる
  try {
    $manifest = Invoke-RestMethod -Uri 'http://localhost:8081/' -Headers @{ 'expo-platform' = 'ios' } -TimeoutSec 20
    $bundleUrl = $manifest.launchAsset.url
    if ($bundleUrl) {
      Add-Content $log "$(Get-Date -Format s) warming ios bundle: $bundleUrl"
      Invoke-WebRequest -Uri $bundleUrl -TimeoutSec 900 -OutFile (Join-Path $env:TEMP 'mt-warm-bundle.js') | Out-Null
      Add-Content $log "$(Get-Date -Format s) ios bundle warmed"
    }
  } catch {
    Add-Content $log "$(Get-Date -Format s) warm failed: $($_.Exception.Message)"
  }
}

while ($true) {
  $listening = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    Add-Content $log "$(Get-Date -Format s) tunnel not running - starting"
    Set-Location $app
    Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -WorkingDirectory $app `
      -ArgumentList '/c', 'npx expo start --tunnel --port 8081 >> "%LOCALAPPDATA%\memory-twin-tunnel.log" 2>&1'
    # Metroが応答し始めるまで待つ（最大5分）→ 予熱
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 5
      try {
        $null = Invoke-WebRequest -Uri 'http://localhost:8081/status' -TimeoutSec 3
        break
      } catch {}
    }
    Warm-Bundle
  } else {
    Start-Sleep -Seconds 30
  }
}
