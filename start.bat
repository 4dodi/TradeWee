@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Tradewee App
echo ============================================
echo   Tradewee - Analyse de charts de trading
echo ============================================
if not exist node_modules (
  echo Premiere installation des dependances...
  call npm install --no-fund --no-audit
)
rem Certains antivirus inspectent le HTTPS avec leur propre certificat :
rem on autorise alors le repli TLS non verifie (usage local uniquement).
set ALLOW_INSECURE_TLS=1
echo.
echo Demarrage : http://localhost:3000
echo (Ctrl+C pour arreter)
echo.
node server.js
pause
