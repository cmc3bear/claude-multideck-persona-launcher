@echo off
REM MultiDeck Dashboard launcher — sets env vars and starts the server.
REM Edit these paths to match your workspace layout.

set DISPATCH_PROJECTS_DIR=F:\01-ACTIVE
set DISPATCH_WORKSPACE_ROOT=D:\Dev
REM 3046 (was 3045) — Windows iphlpsvc squats 3045 on this host. See CLAUDE.md "Environment variables".
set DISPATCH_PORT=3046

echo Starting MultiDeck Dashboard on port %DISPATCH_PORT%...
echo Projects dir: %DISPATCH_PROJECTS_DIR%
echo Workspace root: %DISPATCH_WORKSPACE_ROOT%
echo.

node dashboard\server.cjs
