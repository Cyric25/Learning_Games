# create-zip.ps1
#
# Erstellt ZIPs fuer den Upload auf den Webserver.
#
# Modi:
#   .\create-zip.ps1              -> Delta: backups/Spiele.zip (geaenderte Dateien) + backups/FULL/Spiele.zip (komplett)
#   .\create-zip.ps1 -Full        -> backups/Spiele.zip (alles) + backups/FULL/Spiele.zip (komplett) + alle Spiel-ZIPs
#   .\create-zip.ps1 -Game memory -> Nur ein einzelnes Spiel-ZIP neu erstellen
#
# Ausgabe:
#   backups/Spiele.zip            <- Upload-Paket (Delta oder Full) - dieses auf den Server hochladen
#   backups/FULL/Spiele.zip       <- Vollstaendiges Archiv (immer, versioniert)
#   dist/<Spiel>.zip              <- Pro Spiel (bei Aenderungen / -Full / -Game)

param(
    [switch]$Full,
    [string]$Game = ''
)

$source  = $PSScriptRoot
$backups = Join-Path $source 'backups'
$fullDir = Join-Path $backups 'FULL'
$dist    = Join-Path $source 'dist'

foreach ($d in @($backups, $fullDir, $dist)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}

Add-Type -Assembly System.IO.Compression.FileSystem

# ====================================================================
# KONFIGURATION
# ====================================================================

# Ausschluesse gelten fuer ALLE ZIPs
$excludePaths = @(
    '\backups\',
    '\dist\',
    '\.git\',
    '\node_modules\',
    '\.claude\',
    '\_templates\',
    '\data\'      # ALLE data-Ordner (root + alle Spiel-Unterordner) - nie ueberschreiben
)
$excludeFiles = @(
    '.zip-version',
    '.zip-baseline',
    '.gitignore',
    '.htpasswd'
)
# Dateiendungen die nie auf den Server gehoeren
$excludeExtensions = @(
    '.ps1',   # PowerShell-Skripte (lokale Tools)
    '.bat',   # Batch-Dateien (lokale Tools)
    '.md'     # Markdown-Dokumente (Entwicklungsdocs)
)

# Spiel-Definitionen: Name -> Unterordner
# 'root' = Dateien direkt im Wurzelverzeichnis (keine Unterordner)
$gameMap = [ordered]@{
    'risiko-quiz'      = 'risiko-quiz'
    'quizpfad'         = 'quizpfad'
    'escape-room'      = 'escape-room'
    'memory'           = 'memory'
    'Leiterspiel-quiz' = 'Leiterspiel-quiz'
    'Labyrint-Quiz'    = 'Labyrint-Quiz'
    'stadt-land-fluss' = 'stadt-land-fluss'
    'schiffeversenken' = 'schiffeversenken'
    'codenames'        = 'codenames'
    'lernkarten'       = 'lernkarten'
    'root'             = '.'   # Wurzeldateien (spiele.html, admin.html, api.php, ...)
}

# ====================================================================
# HILFSFUNKTIONEN
# ====================================================================

function IsExcluded([string]$fullPath) {
    foreach ($pat in $excludePaths) {
        if ($fullPath.Contains($pat)) { return $true }
    }
    $name = Split-Path $fullPath -Leaf
    if ($excludeFiles -contains $name) { return $true }
    $ext = [System.IO.Path]::GetExtension($name).ToLower()
    return $excludeExtensions -contains $ext
}

function RelPath([string]$fullPath) {
    return ($fullPath.Substring($source.Length).TrimStart('\', '/')) -replace '\\', '/'
}

function AddToZip($zip, [string]$fullPath, [string]$entry) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $fullPath, $entry, 'Optimal') | Out-Null
}

function AllFiles() {
    return Get-ChildItem $source -Recurse -File |
        Where-Object { -not (IsExcluded $_.FullName) }
}

function FilesForGame([string]$gameName) {
    $folder = $gameMap[$gameName]
    if (-not $folder) { return @() }

    if ($folder -eq '.') {
        return Get-ChildItem $source -File |
            Where-Object { -not (IsExcluded $_.FullName) }
    } else {
        $path = Join-Path $source $folder
        if (-not (Test-Path $path)) { return @() }
        return Get-ChildItem $path -Recurse -File |
            Where-Object { -not (IsExcluded $_.FullName) }
    }
}

function GameForPath([string]$relPath) {
    $top = ($relPath -split '/')[0]
    foreach ($name in $gameMap.Keys) {
        $folder = $gameMap[$name]
        if ($folder -eq '.') {
            if ($relPath -notmatch '/') { return $name }
        } elseif ($top -eq $folder) {
            return $name
        }
    }
    return $null
}

# ====================================================================
# UPLOAD-ZIP (backups/Spiele.zip) - Delta oder Full
# ====================================================================

function Build-UploadZip([string[]]$relPaths, [string]$label = 'Delta') {
    $zipPath = Join-Path $backups 'Spiele.zip'

    if (-not $relPaths -or $relPaths.Count -eq 0) {
        Write-Host '  backups/Spiele.zip  - keine Aenderungen (nicht erstellt)' -ForegroundColor DarkGray
        return
    }

    # Uploadbare Dateien VOR dem Erstellen der ZIP pruefen
    $eligible = @($relPaths | Where-Object {
        $full = Join-Path $source ($_ -replace '/', '\')
        (Test-Path $full) -and (-not (IsExcluded $full))
    })

    if ($eligible.Count -eq 0) {
        Write-Host '  backups/Spiele.zip  - keine uploadbaren Aenderungen' -ForegroundColor DarkGray
        return
    }

    if (Test-Path $zipPath) { Remove-Item $zipPath }
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
    foreach ($rel in $eligible) {
        $full = Join-Path $source ($rel -replace '/', '\')
        AddToZip $zip $full $rel
    }
    $zip.Dispose()

    $kb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
    Write-Host "  backups/Spiele.zip  [$label] $($eligible.Count) Dateien ($kb KB)  <- hochladen" -ForegroundColor Yellow
}

# ====================================================================
# FULL-ARCHIV (backups/FULL/Spiele.zip) - immer vollstaendig, versioniert
# ====================================================================

function Build-FullArchiv() {
    $vFile = Join-Path $source '.zip-version'

    $v = 1
    if (Test-Path $vFile) { $v = [int](Get-Content $vFile -Raw).Trim() + 1 }

    $archName = "Spiele_v{0:D3}.zip" -f $v
    $archPath = Join-Path $fullDir $archName

    $zip   = [System.IO.Compression.ZipFile]::Open($archPath, 'Create')
    $count = 0
    foreach ($f in AllFiles) {
        AddToZip $zip $f.FullName (RelPath $f.FullName)
        $count++
    }
    $zip.Dispose()
    $v | Set-Content $vFile

    $kb = [math]::Round((Get-Item $archPath).Length / 1KB, 1)
    Write-Host "  backups/FULL/$archName  - $count Dateien ($kb KB)" -ForegroundColor Green

    $old = Get-ChildItem $fullDir -Filter 'Spiele_v*.zip' | Sort-Object Name
    if ($old.Count -gt 10) {
        $old | Select-Object -First ($old.Count - 10) | ForEach-Object {
            Remove-Item $_.FullName
            Write-Host "    Geloescht (alt): $($_.Name)" -ForegroundColor DarkGray
        }
    }
}

# ====================================================================
# SPIEL-ZIP - einzelnes Spiel
# ====================================================================

function Build-GameZip([string]$gameName) {
    if (-not $gameMap.Contains($gameName)) {
        Write-Host "  Unbekanntes Spiel: $gameName" -ForegroundColor Red
        Write-Host "  Verfuegbar: $($gameMap.Keys -join ', ')" -ForegroundColor DarkGray
        return
    }

    $zipPath = Join-Path $dist "$gameName.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath }

    $files = @(FilesForGame $gameName)
    if ($files.Count -eq 0) {
        Write-Host "  dist/$gameName.zip  - (keine Dateien, uebersprungen)" -ForegroundColor DarkGray
        return
    }

    $zip   = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
    $count = 0
    foreach ($f in $files) {
        AddToZip $zip $f.FullName (RelPath $f.FullName)
        $count++
    }
    $zip.Dispose()

    $kb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
    Write-Host "  dist/$gameName.zip  - $count Dateien ($kb KB)" -ForegroundColor Cyan
}

# ====================================================================
# DELTA - geaenderte Dateien via Git ermitteln
# ====================================================================

function Get-Delta() {
    $baselineFile = Join-Path $source '.zip-baseline'
    $head = (git -C $source rev-parse HEAD 2>$null)
    if (-not $head) {
        Write-Host '  Git nicht verfuegbar - kein Delta moeglich' -ForegroundColor Yellow
        return $null
    }
    $head = $head.Trim()

    $baseline = $null
    if (Test-Path $baselineFile) { $baseline = (Get-Content $baselineFile -Raw).Trim() }

    if (-not $baseline) {
        Write-Host '  Keine Baseline - alle Dateien werden als geaendert betrachtet' -ForegroundColor Yellow
        $all = @(AllFiles | ForEach-Object { RelPath $_.FullName })
        return @{ changed = $all; baseline = $null; head = $head }
    }

    git -C $source cat-file -e "$baseline^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Baseline-Commit $($baseline.Substring(0,7)) nicht gefunden - alle Dateien" -ForegroundColor Yellow
        $all = @(AllFiles | ForEach-Object { RelPath $_.FullName })
        return @{ changed = $all; baseline = $null; head = $head }
    }

    if ($baseline -eq $head) {
        return @{ changed = @(); baseline = $baseline; head = $head }
    }

    $changed = @(git -C $source diff --name-only "$baseline" $head 2>$null |
        Where-Object { $_ -and $_.Trim() -ne '' })

    return @{ changed = $changed; baseline = $baseline; head = $head }
}

function Set-Baseline([string]$head) {
    $head | Set-Content (Join-Path $source '.zip-baseline')
}

# ====================================================================
# HAUPTPROGRAMM
# ====================================================================

Write-Host ''
Write-Host '======================================' -ForegroundColor DarkCyan
Write-Host '   ZIP-Ersteller - Unterrichtsspiele  ' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor DarkCyan
Write-Host ''

# -- Modus: Einzelspiel -----------------------------------------------
if ($Game -ne '') {
    Write-Host "[ Einzelspiel: $Game ]" -ForegroundColor Magenta
    Build-GameZip $Game
    Write-Host ''
    Write-Host '  Fertig.' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# -- Modus: Full (alle Spiel-ZIPs erzwingen) --------------------------
if ($Full) {
    Write-Host '[ Full-Rebuild ]' -ForegroundColor Magenta
    Write-Host ''

    Write-Host '[ Spiel-ZIPs (alle) ]' -ForegroundColor Magenta
    foreach ($name in $gameMap.Keys) {
        Build-GameZip $name
    }
    Write-Host ''

    Write-Host '[ Upload-ZIP (vollstaendig) ]' -ForegroundColor Magenta
    $allRel = @(AllFiles | ForEach-Object { RelPath $_.FullName })
    Build-UploadZip $allRel 'Full'
    Write-Host ''

    Write-Host '[ Archiv (FULL) ]' -ForegroundColor Magenta
    Build-FullArchiv

    $head = (git -C $source rev-parse HEAD 2>$null)
    if ($head) {
        Set-Baseline $head.Trim()
        Write-Host ''
        Write-Host "  Baseline gesetzt -> $($head.Trim().Substring(0, [Math]::Min(7, $head.Trim().Length)))" -ForegroundColor DarkGray
    }

    Write-Host ''
    Write-Host '  Fertig.' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# -- Modus: Delta (Standard) ------------------------------------------
Write-Host '[ Delta-Modus: geaenderte Dateien seit letztem ZIP ]' -ForegroundColor Magenta
Write-Host ''

$delta = Get-Delta

if ($null -eq $delta) {
    Write-Host '  Kein Git - Abbruch.' -ForegroundColor Red
    Write-Host ''
    exit 1
}

$changed = @($delta.changed)

if ($changed.Count -eq 0) {
    $bShort = $delta.baseline.Substring(0, [Math]::Min(7, $delta.baseline.Length))
    Write-Host "  Keine Aenderungen seit Baseline $bShort" -ForegroundColor DarkGray
    Write-Host ''
} else {
    $bLabel = if ($delta.baseline) { $delta.baseline.Substring(0, [Math]::Min(7, $delta.baseline.Length)) } else { '(start)' }
    $hLabel = $delta.head.Substring(0, [Math]::Min(7, $delta.head.Length))
    Write-Host "  $($changed.Count) Datei(en) geaendert  $bLabel -> $hLabel" -ForegroundColor White
    Write-Host ''

    $changed | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Write-Host ''

    $affectedGames = @($changed |
        ForEach-Object { GameForPath $_ } |
        Where-Object { $_ } |
        Sort-Object -Unique)

    if ($affectedGames.Count -gt 0) {
        Write-Host "  Betroffene Spiele: $($affectedGames -join ', ')" -ForegroundColor White
        Write-Host ''

        Write-Host '[ Spiel-ZIPs (nur geaenderte Spiele) ]' -ForegroundColor Magenta
        foreach ($name in $affectedGames) {
            if ($name -ne 'root') {
                Build-GameZip $name
            } else {
                Write-Host '  root-Dateien - kein separates Spiel-ZIP' -ForegroundColor DarkGray
            }
        }
        Write-Host ''
    }
}

Write-Host '[ Upload-ZIP (geaenderte Dateien) ]' -ForegroundColor Magenta
Build-UploadZip $changed 'Delta'
Write-Host ''

Write-Host '[ Archiv (FULL) ]' -ForegroundColor Magenta
Build-FullArchiv

Set-Baseline $delta.head
$hLabel = $delta.head.Substring(0, [Math]::Min(7, $delta.head.Length))
Write-Host ''
Write-Host "  Baseline aktualisiert -> $hLabel" -ForegroundColor DarkGray

Write-Host ''
Write-Host '  Fertig.' -ForegroundColor Green
Write-Host ''
