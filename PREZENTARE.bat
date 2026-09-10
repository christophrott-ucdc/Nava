@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title EXODUS7 - Prezentare
where node.exe >nul 2>&1
if errorlevel 1 (
  echo [EXODUS7] Node.js nu este disponibil in PATH. Foloseste instalarea Node.js 22+ a proiectului.
  pause
  exit /b 1
)
node scripts\presentation-start.mjs %*
set "PRESENTATION_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %PRESENTATION_EXIT%
