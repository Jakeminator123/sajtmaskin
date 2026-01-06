@echo off
title MPC Server - sajtmaskin
echo ====================================
echo   MPC Server for sajtmaskin
echo ====================================
echo.
echo Docs:  %~dp0docs\
echo Logs:  %~dp0logs\
echo.
echo Starting server... (Ctrl+C to stop)
echo.

cd /d "%~dp0..\.."
node ./services/mpc/server.mjs

echo.
echo Server stopped.
pause

