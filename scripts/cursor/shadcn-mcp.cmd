@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

set "NODE_VERSION="
if exist "%REPO_ROOT%\.node-version" (
  set /p NODE_VERSION=<"%REPO_ROOT%\.node-version"
)

set "NODE_EXE="
if defined NODE_VERSION if defined VOLTA_HOME if exist "%VOLTA_HOME%\tools\image\node\%NODE_VERSION%\node.exe" (
  set "NODE_EXE=%VOLTA_HOME%\tools\image\node\%NODE_VERSION%\node.exe"
)

if not defined NODE_EXE if defined NODE_VERSION if exist "%LOCALAPPDATA%\Volta\tools\image\node\%NODE_VERSION%\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Volta\tools\image\node\%NODE_VERSION%\node.exe"
)

if not defined NODE_EXE (
  for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"
)

if not defined NODE_EXE (
  echo [shadcn-mcp] node.exe not found. Install Volta/Node or update .cursor/mcp.json. 1>&2
  exit /b 1
)

"%NODE_EXE%" "%REPO_ROOT%\scripts\cursor\shadcn-mcp.cjs"
