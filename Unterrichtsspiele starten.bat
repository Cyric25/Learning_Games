@echo off
chcp 65001 >nul
title Unterrichtsspiele
cd /d "%~dp0"

:: Node.js vorhanden?
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  FEHLER: Node.js ist nicht installiert!
    echo  Bitte von https://nodejs.org herunterladen.
    echo.
    pause
    exit /b 1
)

:: Laeuft der Server schon auf Port 3000?
netstat -ano | findstr /R ":3000 .*LISTEN" >nul 2>&1
if %errorlevel% == 0 (
    echo  Server laeuft bereits. Oeffne Browser...
    timeout /t 1 /nobreak >nul
    start http://localhost:3000
    exit /b 0
)

:: Server in eigenem minimierten Fenster starten
echo  Starte Server...
start /MIN "Unterrichtsspiele – Server (nicht schliessen!)" cmd /k "cd /d "%~dp0" && node server.js"

:: Warten bis Server bereit ist
echo  Warte auf Server...
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R ":3000 .*LISTEN" >nul 2>&1
if %errorlevel% neq 0 goto wait

:: Browser oeffnen
echo  Oeffne Browser...
start http://localhost:3000

:: Fenster schliesst sich nach 2 Sekunden
timeout /t 2 /nobreak >nul
exit /b 0
