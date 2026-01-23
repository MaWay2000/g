param(
  [Parameter(Mandatory=$true)]
  [string]$ProtoUrl
)

$ErrorActionPreference = "Stop"
$Log = Join-Path $env:TEMP "wzreplay_handler.log"

function Log($msg) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $Log -Value "[$ts] $msg"
}

try {
  if (Test-Path $Log) { Remove-Item $Log -Force -ErrorAction SilentlyContinue }
  Log "Received: $ProtoUrl"

  if ($ProtoUrl -notmatch '^wzreplay:') { throw "Not a wzreplay: URL" }

  # Parse URL from wzreplay://open?url=... (some browsers normalize to wzreplay://open/?url=...)
  $raw = $ProtoUrl.Substring("wzreplay:".Length).TrimStart("/")
  $replayUrl = $null

  # accept both: open?url=... AND open/?url=...
  if ($raw -match '^(?i)open\/?\?') {
    $u = [Uri]("wzreplay://"+$raw)
    $q = [System.Web.HttpUtility]::ParseQueryString($u.Query)
    $replayUrl = $q.Get("url")
    $replayUrl = [Uri]::UnescapeDataString($replayUrl)
  } else {
    $replayUrl = [Uri]::UnescapeDataString($raw)
  }

  if (-not $replayUrl) { throw "Could not parse replay url" }
  Log "Replay URL: $replayUrl"

  $ru = [Uri]$replayUrl
  if ($ru.Scheme -ne "https") { throw "Only https allowed" }
  if ($ru.AbsolutePath -notmatch '\.wzrp$') { throw "Only .wzrp allowed" }
  if ($ru.Host -notin @("www.wz-2100.com","wz-2100.com")) { throw "Host not allowed: $($ru.Host)" }

  # Find best Warzone config dir under %APPDATA%\Warzone 2100 Project\Warzone 2100*
  $base = Join-Path $env:APPDATA "Warzone 2100 Project"
  if (-not (Test-Path $base)) { New-Item -ItemType Directory -Path $base | Out-Null }

  $candidates = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.ToLower().StartsWith("warzone 2100") }

  if (-not $candidates) {
    $default = Join-Path $base "Warzone 2100"
    New-Item -ItemType Directory -Path $default -Force | Out-Null
    $configDir = Get-Item $default
  } else {
    $configDir = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

  $targetDir = Join-Path $configDir.FullName "replay\multiplay"
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  Log "Target replay dir: $targetDir"

  $fileName = [IO.Path]::GetFileName($ru.AbsolutePath)
  $dest = Join-Path $targetDir $fileName
  $part = "$dest.part"

  # Download
  Log "Downloading to: $dest"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $replayUrl -OutFile $part -UseBasicParsing
  Move-Item -Force $part $dest
  Log "Saved: $dest"

  function Find-WarzoneExe {
    $pf  = ${env:ProgramFiles}
    $pf86 = ${env:ProgramFiles(x86)}
    $common = @(
      Join-Path $pf  "Warzone 2100\warzone2100.exe",
      Join-Path $pf86 "Warzone 2100\warzone2100.exe",
      Join-Path $pf86 "Steam\steamapps\common\Warzone 2100\warzone2100.exe",
      Join-Path $pf  "Steam\steamapps\common\Warzone 2100\warzone2100.exe"
    )
    foreach ($p in $common) { if (Test-Path $p) { return $p } }

    # Try SteamPath registry
    try {
      $steamPath = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -Name SteamPath -ErrorAction Stop).SteamPath
      if ($steamPath) {
        $candidate = Join-Path $steamPath "steamapps\common\Warzone 2100\warzone2100.exe"
        if (Test-Path $candidate) { return $candidate }
      }
    } catch {}

    return $null
  }

  $exe = Find-WarzoneExe
  if ($exe) {
    Log "Launching Warzone: $exe"
    # Try auto-load replay:
    Start-Process -FilePath $exe -ArgumentList "--loadreplay=$dest"
  } else {
    Log "warzone2100.exe not found; falling back to Steam launch + open folder"
    Start-Process "steam://rungameid/1241950" | Out-Null
    Start-Process "explorer.exe" -ArgumentList "`"$targetDir`"" | Out-Null
  }

} catch {
  Log "ERROR: $($_.Exception.Message)"
  Start-Process notepad.exe -ArgumentList "`"$Log`"" | Out-Null
  throw
}
