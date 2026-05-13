# create-zip-game.ps1 – ZIP eines Spiel-Unterordners in dist/ (ohne Datenbanken)
# Aufruf: create-zip-game.ps1 -FilePath <bearbeitete Datei>
# oder:   create-zip-game.ps1 -Game <spielordner>

param(
    [string]$FilePath = "",
    [string]$Game = ""
)

$projectRoot = $PSScriptRoot
$distDir     = Join-Path $projectRoot "dist"

$knownGames  = @('memory', 'risiko-quiz', 'quizpfad', 'escape-room',
                  'Leiterspiel-quiz', 'Labyrint-Quiz', 'stadt-land-fluss')

# Spiel aus Dateipfad ermitteln
if (-not $Game -and $FilePath) {
    foreach ($g in $knownGames) {
        if ($FilePath -like "*\$g\*" -or $FilePath -like "*/$g/*") {
            $Game = $g
            break
        }
    }
}

if (-not $Game) { exit 0 }
if ($knownGames -notcontains $Game) { Write-Host "Unbekanntes Spiel: $Game"; exit 1 }

$sourceDir = Join-Path $projectRoot $Game
if (-not (Test-Path $sourceDir)) { Write-Host "Ordner nicht gefunden: $sourceDir"; exit 1 }

if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

$zipPath = Join-Path $distDir "$Game.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')

Get-ChildItem $sourceDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($sourceDir.Length).TrimStart('\','/')

    # Spiel-spezifische Ausschlüsse
    $skip = $false
    switch ($Game) {
        'memory'      { if ($rel -match '^data[\\/]') { $skip = $true } }
        'risiko-quiz' { if ($rel -match '^data[\\/]' -and $rel -notmatch '^data[\\/]templates[\\/]') { $skip = $true } }
    }
    if ($skip) { return }

    $entry = ("$Game/$rel") -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, $entry, 'Optimal') | Out-Null
}

$zip.Dispose()

$size = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "OK: dist/$Game.zip ($size KB)" -ForegroundColor Green
