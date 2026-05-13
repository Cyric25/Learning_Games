# create-zip-memory.ps1 – ZIP des memory-Ordners ohne Datenbanken (data/)

$source  = Join-Path $PSScriptRoot "memory"
$zipDir  = Join-Path $PSScriptRoot "backups"
$current = Join-Path $zipDir "memory.zip"

if (-not (Test-Path $zipDir)) { New-Item -ItemType Directory -Path $zipDir | Out-Null }

if (Test-Path $current) { Remove-Item $current -Force }

Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($current, 'Create')

Get-ChildItem $source -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\data\\'
} | ForEach-Object {
    $rel   = $_.FullName.Substring($source.Length).TrimStart('\','/')
    $entry = ("memory/$rel") -replace '\\','/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, $entry, 'Optimal') | Out-Null
}

$zip.Dispose()

$size = [math]::Round((Get-Item $current).Length / 1KB, 1)
Write-Host "OK: memory.zip ($size KB)" -ForegroundColor Green
