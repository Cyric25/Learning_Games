# create-zip.ps1 - Alles im Ordner außer Datenbanken & Laufzeitdaten
# Aktuelles ZIP heißt immer "Spiele.zip"; beim Erstellen wird das alte archiviert.

$source      = $PSScriptRoot
$versionFile = Join-Path $source ".zip-version"
$zipDir      = Join-Path $source "backups"
$current     = Join-Path $zipDir "Spiele.zip"

if (-not (Test-Path $zipDir)) { New-Item -ItemType Directory -Path $zipDir | Out-Null }

# Versionsnummer ermitteln
$version = 1
if (Test-Path $versionFile) {
    $version = [int](Get-Content $versionFile -Raw).Trim() + 1
}

# Bestehendes Spiele.zip umbenennen
if (Test-Path $current) {
    $archiveName = "Spiele_v{0:D3}.zip" -f ($version - 1)
    Rename-Item $current (Join-Path $zipDir $archiveName)
    Write-Host "Archiviert: $archiveName" -ForegroundColor DarkGray
}

Write-Host "Erstelle Spiele.zip (v$version) ..." -ForegroundColor Cyan

Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($current, 'Create')

# Ausschluss-Muster (FullName-Abgleich, immer Backslash)
$excludePaths = @(
    '\backups\',          # ZIP-Archive
    '\dist\',             # Einzelspiel-ZIPs
    '\.git\',             # Git-Repository
    '\node_modules\',     # falls vorhanden
    '\.claude\',          # Claude-Arbeitsdateien
    '\data\questions.json',             # zentrale Fragendatenbank
    '\memory\data\pairs.json',          # Memory-Paare
    '\memory\data\images\',             # hochgeladene Bilder
    '\risiko-quiz\data\gamestate.json', # Legacy-Spielstand
    '\risiko-quiz\data\games\',         # aktive Spielstände
    '\Leiterspiel-quiz\data\games\',    # aktive Spielstände
    '\Labyrint-Quiz\data\games\',       # aktive Spielstände
    '\schiffeversenken\data\games\',    # aktive Spielstände
    '\data\games\codenames\',           # Codenames Spielstände
    '\data\codenames\',                 # Codenames Wortlisten-DB
    '\data\labyrinth-designer\'         # eigene Labyrinthe (Designer-Bibliothek)
)
$excludeFiles = @(
    '.zip-version'   # interner Versionszähler
)

$files = Get-ChildItem $source -Recurse -File

$count = 0
foreach ($file in $files) {
    $full = $file.FullName

    # Dateinamen-Ausschluss
    if ($excludeFiles -contains $file.Name) { continue }

    # Pfad-Ausschluss
    $skip = $false
    foreach ($pat in $excludePaths) {
        if ($full.Contains($pat)) { $skip = $true; break }
    }
    if ($skip) { continue }

    # Relativen ZIP-Eintrag berechnen
    $rel = $full.Substring($source.Length).TrimStart('\','/')
    $entry = $rel -replace '\\','/'

    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $full, $entry, 'Optimal') | Out-Null
    $count++
}

$zip.Dispose()

# Version speichern
$version | Set-Content $versionFile

$size = [math]::Round((Get-Item $current).Length / 1KB, 1)
Write-Host "OK: Spiele.zip ($size KB) - $count Dateien" -ForegroundColor Green

# Letzte 10 Archiv-Versionen behalten
$allZips = Get-ChildItem $zipDir -Filter "Spiele_v*.zip" | Sort-Object Name
if ($allZips.Count -gt 10) {
    $allZips | Select-Object -First ($allZips.Count - 10) | ForEach-Object {
        Remove-Item $_.FullName
        Write-Host "Geloescht (alt): $($_.Name)" -ForegroundColor DarkGray
    }
}
