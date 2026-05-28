@echo off
title Pocket Tube Launcher
echo ========================================================
echo       Pocket Tube — Multi-Platform Downloader
echo ========================================================
echo.

echo [1/2] Starting Express backend server on port 5000...
start "Pocket Tube Backend API Server" cmd /k "cd server && set PATH=C:\Program Files\nodejs;%%PATH%% && npm start"

echo [2/2] Starting Vite React frontend server...
echo.
set PATH=C:\Program Files\nodejs;%PATH%
npm run dev

pause
