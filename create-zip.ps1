# create-zip.ps1 – Aktuelles ZIP heißt immer "Spiele.zip"
# Beim neuen Erstellen wird das bisherige Spiele.zip in Spiele_vXXX.zip umbenannt.

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

function Add-File($zip, $fsPath, $zipEntry) {
    if (Test-Path $fsPath -PathType Leaf) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $fsPath, ($zipEntry -replace '\\','/'), 'Optimal') | Out-Null
    }
}

function Add-Folder($zip, $folderPath, $zipPrefix) {
    Get-ChildItem $folderPath -Recurse -File | ForEach-Object {
        $rel   = $_.FullName.Substring($folderPath.Length).TrimStart('\','/')
        $entry = ("$zipPrefix/$rel") -replace '\\','/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $_.FullName, $entry, 'Optimal') | Out-Null
    }
}

# Root
Add-File $zip (Join-Path $source "spiele.html") "spiele.html"
Add-File $zip (Join-Path $source "api.php")    "api.php"
Add-File $zip (Join-Path $source ".htaccess")  ".htaccess"

# Risiko-Quiz
$rq = Join-Path $source "risiko-quiz"
Add-File   $zip (Join-Path $rq "index.html")    "risiko-quiz/index.html"
Add-File   $zip (Join-Path $rq "admin.html")    "risiko-quiz/admin.html"
Add-File   $zip (Join-Path $rq "view.html")     "risiko-quiz/view.html"
Add-File   $zip (Join-Path $rq "practice.html") "risiko-quiz/practice.html"
Add-Folder $zip (Join-Path $rq "js")         "risiko-quiz/js"
Add-Folder $zip (Join-Path $rq "css")        "risiko-quiz/css"
# data/templates (Vorlagen) – questions.json + gamestate.json werden NICHT mitgepackt
$dataTemplates = Join-Path $rq "data\templates"
if (Test-Path $dataTemplates) {
    Add-Folder $zip $dataTemplates "risiko-quiz/data/templates"
}

# Memory
$mem = Join-Path $source "memory"
Add-File   $zip (Join-Path $mem "index.html")    "memory/index.html"
Add-File   $zip (Join-Path $mem "admin.html")    "memory/admin.html"
Add-Folder $zip (Join-Path $mem "js")            "memory/js"
Add-Folder $zip (Join-Path $mem "css")           "memory/css"
Add-Folder $zip (Join-Path $mem "lib")           "memory/lib"
# data/pairs.json wird NICHT mitgepackt (wie bei Risiko-Quiz)

# QuizPfad
$qp = Join-Path $source "quizpfad"
Add-File   $zip (Join-Path $qp "index.html")    "quizpfad/index.html"
Add-File   $zip (Join-Path $qp "admin.html")    "quizpfad/admin.html"
Add-Folder $zip (Join-Path $qp "js")            "quizpfad/js"
Add-Folder $zip (Join-Path $qp "css")           "quizpfad/css"
# data/fragen.json wird NICHT mitgepackt (Spieldaten)

# Stadt-Land-Fluss
$slf = Join-Path $source "stadt-land-fluss"
Add-File $zip (Join-Path $slf "index.html")      "stadt-land-fluss/index.html"
Add-File $zip (Join-Path $slf "categories.json") "stadt-land-fluss/categories.json"

$zip.Dispose()

# Version speichern
$version | Set-Content $versionFile

$size = [math]::Round((Get-Item $current).Length / 1KB, 1)
Write-Host "OK: Spiele.zip ($size KB)" -ForegroundColor Green

# Letzte 10 Archiv-Versionen behalten
$allZips = Get-ChildItem $zipDir -Filter "Spiele_v*.zip" | Sort-Object Name
if ($allZips.Count -gt 10) {
    $allZips | Select-Object -First ($allZips.Count - 10) | ForEach-Object {
        Remove-Item $_.FullName
        Write-Host "Gelöscht (alt): $($_.Name)" -ForegroundColor DarkGray
    }
}
